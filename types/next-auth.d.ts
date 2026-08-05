import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
      theme: string;
      timezone: string;
      extension: string | null;
      soundNotifications: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    role: Role;
    mustChangePassword: boolean;
    theme: string;
    timezone: string;
    extension: string | null;
    soundNotifications: boolean;
  }
}

export {};
