const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./utils/prisma');
const logger = require('./utils/logger');
const { createOriginCallback } = require('./utils/corsOrigins');

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: createOriginCallback(process.env.CORS_ORIGIN),
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.user = decoded;
      next();
    });
  });

  io.on('connection', (socket) => {
    logger.info('Socket connected', { userId: socket.user.userId });
    // Join personal room for targeted notifications
    socket.join(`user:${socket.user.userId}`);

    // Tribe Rooms
    socket.on('join_room', async (roomId) => {
      if (!roomId || typeof roomId !== 'string') {
        socket.emit('error', { message: 'Invalid roomId' });
        return;
      }
      try {
        const channel = await prisma.tribeChannel.findUnique({ where: { id: roomId } });
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }
        socket.join(roomId);
        logger.info('User joined room', { userId: socket.user.userId, roomId });
        io.to(roomId).emit('tribe:user_joined', { userId: socket.user.userId });
      } catch (error) {
        logger.error('join_room error', { error: error.message, roomId });
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave_room', (roomId) => {
      if (!roomId) return;
      socket.leave(roomId);
      logger.info('User left room', { userId: socket.user.userId, roomId });
    });

    socket.on('tribe:typing', (data) => {
      if (!data?.roomId) return;
      socket.to(data.roomId).emit('tribe:typing', {
        userId: socket.user.userId,
        roomId: data.roomId,
      });
    });

    socket.on('send_message', async (data) => {
      const { roomId, content, message: legacyMsg } = data;
      const text = content || legacyMsg || '';

      if (!text.trim() || !roomId) {
        socket.emit('error', { message: 'Message content and roomId are required' });
        return;
      }

      try {
        const savedMessage = await prisma.chatMessage.create({
          data: {
            content: text,
            channelId: roomId,
            userId: socket.user.userId,
          },
          include: {
            user: {
              select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, isVerified: true },
            },
          },
        });

        io.to(roomId).emit('receive_message', {
          id: savedMessage.id,
          content: savedMessage.content,
          userId: socket.user.userId,
          user: savedMessage.user,
          channelId: roomId,
          timestamp: savedMessage.timestamp,
          isBot: false,
        });
      } catch (error) {
        logger.error('Error saving chat message', { error: error.message });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', { userId: socket.user.userId });
    });
  });

  // Attach io to global object or app to use in controllers if needed
  global.io = io;
  
  return io;
};
