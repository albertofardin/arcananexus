import { describe, it, expect } from "vitest";
import {
  membershipSchema,
  membershipWithStatusSchema,
  userProfileSchema,
  membershipsResponseSchema,
} from "./membership";

describe("Membership Schemas", () => {
  describe("membershipSchema", () => {
    it("should validate a valid membership", () => {
      const validMembership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: {
          id: 1,
          value: "50.00",
          createdAt: new Date("2025-01-01"),
          paymentData: { method: "card" },
        },
      };

      const result = membershipSchema.safeParse(validMembership);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.year).toBe(2025);
        expect(result.data.startDate).toBeInstanceOf(Date);
        expect(result.data.endDate).toBeInstanceOf(Date);
      }
    });

    it("should coerce string dates to Date objects", () => {
      const membership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
      };

      const result = membershipSchema.parse(membership);

      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it("should allow null payment", () => {
      const membershipWithoutPayment = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
      };

      const result = membershipSchema.safeParse(membershipWithoutPayment);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payment).toBeNull();
      }
    });

    it("should validate payment data structure", () => {
      const membershipWithPayment = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: {
          id: 1,
          value: "50.00",
          createdAt: new Date("2025-01-01"),
          paymentData: {
            method: "card",
            transactionId: "txn_123",
            provider: "stripe",
          },
        },
      };

      const result = membershipSchema.safeParse(membershipWithPayment);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payment).toMatchObject({
          id: 1,
          value: "50.00",
          createdAt: new Date("2025-01-01"),
          paymentData: expect.any(Object),
        });
      }
    });

    it("should reject membership with missing required fields", () => {
      const invalidMembership = {
        id: 1,
        startDate: "2025-01-01",
        // Missing endDate, year, userId, paymentId
      };

      const result = membershipSchema.safeParse(invalidMembership);

      expect(result.success).toBe(false);
    });

    it("should reject membership with invalid types", () => {
      const invalidMembership = {
        id: "not-a-number",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
      };

      const result = membershipSchema.safeParse(invalidMembership);

      expect(result.success).toBe(false);
    });

    it("should handle payment data as record of unknown values", () => {
      const membership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: {
          id: 1,
          value: "50.00",
          createdAt: new Date("2025-01-01"),
          paymentData: {
            nested: { deeply: { value: 123 } },
            array: [1, 2, 3],
            boolean: true,
          },
        },
      };

      const result = membershipSchema.safeParse(membership);

      expect(result.success).toBe(true);
    });
  });

  describe("membershipWithStatusSchema", () => {
    it("should validate membership with status field", () => {
      const membershipWithStatus = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
        status: "active",
      };

      const result = membershipWithStatusSchema.safeParse(membershipWithStatus);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("active");
      }
    });

    it('should accept "active" status', () => {
      const membership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
        status: "active",
      };

      const result = membershipWithStatusSchema.safeParse(membership);

      expect(result.success).toBe(true);
    });

    it('should accept "expired" status', () => {
      const membership = {
        id: 1,
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        year: 2024,
        userId: "user-123",
        paymentId: 1,
        payment: null,
        status: "expired",
      };

      const result = membershipWithStatusSchema.safeParse(membership);

      expect(result.success).toBe(true);
    });

    it("should reject invalid status values", () => {
      const membership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
        status: "pending",
      };

      const result = membershipWithStatusSchema.safeParse(membership);

      expect(result.success).toBe(false);
    });

    it("should reject membership without status field", () => {
      const membership = {
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
      };

      const result = membershipWithStatusSchema.safeParse(membership);

      expect(result.success).toBe(false);
    });
  });

  describe("userProfileSchema", () => {
    it("should validate a valid user profile", () => {
      const validProfile = {
        id: "user-123",
        name: "John Doe",
        email: "john@example.com",
      };

      const result = userProfileSchema.safeParse(validProfile);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validProfile);
      }
    });

    it("should reject profile with missing fields", () => {
      const invalidProfile = {
        id: "user-123",
        name: "John Doe",
        // Missing email
      };

      const result = userProfileSchema.safeParse(invalidProfile);

      expect(result.success).toBe(false);
    });

    it("should reject profile with invalid types", () => {
      const invalidProfile = {
        id: 123, // Should be string
        name: "John Doe",
        email: "john@example.com",
      };

      const result = userProfileSchema.safeParse(invalidProfile);

      expect(result.success).toBe(false);
    });
  });

  describe("membershipsResponseSchema", () => {
    it("should validate complete response with user and memberships", () => {
      const validResponse = {
        user: {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
        },
        memberships: [
          {
            id: 1,
            startDate: "2025-01-01",
            endDate: "2025-12-31",
            year: 2025,
            userId: "user-123",
            paymentId: 1,
            payment: {
              id: 1,
              value: "50.00",
              createdAt: new Date("2025-01-01"),
              paymentData: { method: "card" },
            },
            status: "active",
          },
        ],
      };

      const result = membershipsResponseSchema.safeParse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.id).toBe("user-123");
        expect(result.data.memberships).toHaveLength(1);
        expect(result.data.memberships[0].status).toBe("active");
      }
    });

    it("should validate response with empty memberships array", () => {
      const responseWithNoMemberships = {
        user: {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
        },
        memberships: [],
      };

      const result = membershipsResponseSchema.safeParse(
        responseWithNoMemberships
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memberships).toEqual([]);
      }
    });

    it("should validate response with multiple memberships", () => {
      const responseWithMultipleMemberships = {
        user: {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
        },
        memberships: [
          {
            id: 1,
            startDate: "2025-01-01",
            endDate: "2025-12-31",
            year: 2025,
            userId: "user-123",
            paymentId: 1,
            payment: null,
            status: "active",
          },
          {
            id: 2,
            startDate: "2024-01-01",
            endDate: "2024-12-31",
            year: 2024,
            userId: "user-123",
            paymentId: 2,
            payment: {
              id: 2,
              value: "45.00",
              createdAt: new Date("2025-01-01"),
              paymentData: {},
            },
            status: "expired",
          },
        ],
      };

      const result = membershipsResponseSchema.safeParse(
        responseWithMultipleMemberships
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memberships).toHaveLength(2);
      }
    });

    it("should reject response with missing user", () => {
      const invalidResponse = {
        memberships: [],
      };

      const result = membershipsResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });

    it("should reject response with missing memberships", () => {
      const invalidResponse = {
        user: {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
        },
      };

      const result = membershipsResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });

    it("should reject response with invalid membership data", () => {
      const invalidResponse = {
        user: {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
        },
        memberships: [
          {
            id: 1,
            // Missing required fields
          },
        ],
      };

      const result = membershipsResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });
  });

  describe("Type Inference", () => {
    it("should infer correct TypeScript types", () => {
      const membership = membershipSchema.parse({
        id: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        year: 2025,
        userId: "user-123",
        paymentId: 1,
        payment: null,
      });

      // Type checking - these should not cause TypeScript errors
      const id: number = membership.id;
      const year: number = membership.year;
      const userId: string = membership.userId;
      const startDate: Date = membership.startDate;
      const payment: {
        id: number;
        value: string;
        paymentData: Record<string, unknown>;
      } | null = membership.payment;

      expect(id).toBeDefined();
      expect(year).toBeDefined();
      expect(userId).toBeDefined();
      expect(startDate).toBeDefined();
      expect(payment).toBeDefined();
    });
  });
});
