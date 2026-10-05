import { vi } from "vitest";
import type { User } from "@prisma/client";

// Mock session structure
export const mockSession = {
  user: {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 86400000), // 24 hours
    token: "test-token",
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  },
};

// Test user fixtures
export const testUsers = {
  admin: {
    id: "user-admin-1",
    name: "Admin User",
    email: "admin@test.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as User,
  helper: {
    id: "user-helper-1",
    name: "Helper User",
    email: "helper@test.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as User,
  regularUser: {
    id: "user-regular-1",
    name: "Regular User",
    email: "user@test.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as User,
};

// Mock Better Auth server-side API
export const mockAuthApi = {
  getSession: vi.fn(() => Promise.resolve(mockSession)),
  deleteSession: vi.fn(() => Promise.resolve(undefined)),
  createSession: vi.fn(() => Promise.resolve(mockSession)),
};

// Mock the server-side auth module
vi.mock("@/lib/auth", () => ({
  auth: {
    api: mockAuthApi,
  },
}));

// Mock Better Auth client-side
export const mockAuthClient = {
  signIn: {
    email: vi.fn(() => Promise.resolve({ data: mockSession, error: null })),
  },
  signUp: {
    email: vi.fn(() => Promise.resolve({ data: mockSession, error: null })),
  },
  signOut: vi.fn(() => Promise.resolve({ data: null, error: null })),
  getSession: vi.fn(() => Promise.resolve({ data: mockSession, error: null })),
  useSession: vi.fn(() => ({
    data: mockSession,
    isPending: false,
    error: null,
  })),
};

// Mock the client-side auth module
vi.mock("@/lib/auth-client", () => mockAuthClient);
