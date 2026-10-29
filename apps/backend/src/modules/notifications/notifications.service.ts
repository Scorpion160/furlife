import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedType?: string;
  relatedId?: string;
  dedupeKey: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDeduplicated(input: CreateNotificationInput) {
    return this.prisma.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
      },
      update: {},
    });
  }

  async list(auth: AuthContext, query: ListNotificationsQueryDto) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId: auth.userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });

    return notifications.map((notification) => this.toResponse(notification));
  }

  async unreadCount(auth: AuthContext) {
    const count = await this.prisma.notification.count({
      where: {
        userId: auth.userId,
        readAt: null,
      },
    });

    return { count };
  }

  async markRead(auth: AuthContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
    });

    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Cette notification est introuvable.',
      });
    }

    if (notification.readAt) {
      return this.toResponse(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });

    return this.toResponse(updated);
  }

  async markAllRead(auth: AuthContext) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId: auth.userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  private toResponse(notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    relatedType: string | null;
    relatedId: string | null;
    payload: Prisma.JsonValue | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      relatedType: notification.relatedType,
      relatedId: notification.relatedId,
      payload: notification.payload,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
