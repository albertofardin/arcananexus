import { describe, it, expect } from "vitest";
import {
  eventSchema,
  eventDetailSchema,
  eventListResponseSchema,
  eventWriteSchema,
} from "./event";

describe("Event Schemas", () => {
  describe("eventSchema", () => {
    it("should validate a valid event object", () => {
      const validEvent = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaignName: "Test Campaign",
        bookingCount: 5,
      };

      const result = eventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("should coerce string dates to Date objects", () => {
      const eventWithStringDates = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        dateEventStart: "2025-06-01",
        dateEventEnd: "2025-06-01",
        datePublicationStart: "2025-01-01",
        datePublicationEnd: "2025-05-25",
      };

      const result = eventSchema.safeParse(eventWithStringDates);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dateEventStart).toBeInstanceOf(Date);
        expect(result.data.datePublicationStart).toBeInstanceOf(Date);
        expect(result.data.datePublicationEnd).toBeInstanceOf(Date);
      }
    });

    it("should use default value for bookingCount when not provided", () => {
      const event = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
      };

      const result = eventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bookingCount).toBe(0);
      }
    });

    it("should fail validation with missing required fields", () => {
      const invalidEvent = {
        id: 1,
        name: "Test Event",
        // missing required date fields
      };

      const result = eventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe("eventDetailSchema", () => {
    it("should validate a valid event detail object", () => {
      const validEventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: "https://example.com/image.jpg",
        description: "# Full Description\n\nLong content...",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 10,
        socials: [
          {
            link: "https://facebook.com/event",
            icon: "facebook",
          },
        ],
      };

      const result = eventDetailSchema.safeParse(validEventDetail);
      expect(result.success).toBe(true);
    });

    it("should accept null image", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
    });

    it("should accept null place", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: null,
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
    });

    it("should reject null description", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: null,
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(false);
    });

    it("should use default empty array for socials when not provided", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.socials).toEqual([]);
      }
    });

    it("should use default 0 for bookingCount when not provided", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bookingCount).toBe(0);
      }
    });

    it("should validate nested campaign structure", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
    });

    it("should fail validation with missing required fields", () => {
      const invalidEventDetail = {
        id: 1,
        name: "Test Event",
        // missing campaign and date fields
      };

      const result = eventDetailSchema.safeParse(invalidEventDetail);
      expect(result.success).toBe(false);
    });

    it("should fail validation with invalid campaign structure", () => {
      const invalidEventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          // missing required fields
          slug: "test-campaign",
        },
        bookingCount: 0,
      };

      const result = eventDetailSchema.safeParse(invalidEventDetail);
      expect(result.success).toBe(false);
    });

    it("should validate social links with null icon", () => {
      const eventDetail = {
        id: 1,
        name: "Test Event",
        place: "Test Location",
        image: null,
        description: "Descrizione",
        dateEventStart: new Date("2025-06-01"),
        dateEventEnd: new Date("2025-06-01"),
        datePublicationStart: new Date("2025-01-01"),
        datePublicationEnd: new Date("2025-05-25"),
        campaign: {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          color: "cobalt",
          logo: null,
        },
        bookingCount: 0,
        socials: [
          {
            link: "https://example.com",
            icon: null,
          },
        ],
      };

      const result = eventDetailSchema.safeParse(eventDetail);
      expect(result.success).toBe(true);
    });
  });

  describe("eventListResponseSchema", () => {
    it("should validate a valid event list response", () => {
      const validResponse = {
        events: [
          {
            id: 1,
            name: "Event 1",
            place: "Location 1",
            dateEventStart: new Date("2025-06-01"),
            dateEventEnd: new Date("2025-06-01"),
            datePublicationStart: new Date("2025-01-01"),
            datePublicationEnd: new Date("2025-05-25"),
            bookingCount: 5,
          },
          {
            id: 2,
            name: "Event 2",
            place: "Location 2",
            dateEventStart: new Date("2025-07-01"),
            dateEventEnd: new Date("2025-07-01"),
            datePublicationStart: new Date("2025-02-01"),
            datePublicationEnd: new Date("2025-06-25"),
            bookingCount: 10,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 2,
          totalPages: 1,
        },
      };

      const result = eventListResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should validate with empty events array", () => {
      const response = {
        events: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 0,
        },
      };

      const result = eventListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it("should fail validation with missing pagination", () => {
      const invalidResponse = {
        events: [],
        // missing pagination
      };

      const result = eventListResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should fail validation with invalid event in array", () => {
      const invalidResponse = {
        events: [
          {
            id: 1,
            // missing required fields
            name: "Event 1",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        },
      };

      const result = eventListResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });
});

describe("eventWriteSchema", () => {
  const valid = {
    name: "Piscinata",
    description: "Una giornata in piscina",
    place: "Piscina comunale",
    dateEventStart: "2026-08-10T10:00:00.000Z",
    dateEventEnd: "2026-08-10T18:00:00.000Z",
    datePublicationStart: "2026-07-01T10:00:00.000Z",
    datePublicationEnd: "2026-08-05T10:00:00.000Z",
    price: "10",
  };

  it("accetta un evento valido senza campagna e coerce il prezzo", () => {
    const result = eventWriteSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.price).toBe(10);
  });

  it("rifiuta fine prima dell'inizio, chiusura prima dell'apertura o dopo la fine evento", () => {
    const paths = (input: object) =>
      eventWriteSchema
        .safeParse({ ...valid, ...input })
        .error?.issues.map(issue => issue.path[0]);

    expect(paths({ dateEventEnd: "2026-08-09T10:00:00.000Z" })).toContain(
      "dateEventEnd"
    );
    expect(paths({ datePublicationEnd: "2026-06-01T10:00:00.000Z" })).toContain(
      "datePublicationEnd"
    );
    expect(paths({ datePublicationEnd: "2026-08-11T10:00:00.000Z" })).toContain(
      "datePublicationEnd"
    );
  });

  it("rifiuta descrizione mancante o vuota", () => {
    expect(
      eventWriteSchema.safeParse({ ...valid, description: "  " }).success
    ).toBe(false);
    const { description: _omit, ...withoutDescription } = valid;
    expect(eventWriteSchema.safeParse(withoutDescription).success).toBe(false);
  });

  it("rifiuta titolo vuoto e prezzo negativo", () => {
    expect(eventWriteSchema.safeParse({ ...valid, name: " " }).success).toBe(
      false
    );
    expect(eventWriteSchema.safeParse({ ...valid, price: "-1" }).success).toBe(
      false
    );
  });
});
