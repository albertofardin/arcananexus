import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  adminUsersResponseSchema,
  type AdminUsersResponse,
} from "@/lib/validations/user";

export const ADMIN_USERS_PAGE_SIZE = 50;

export interface UseQueryAdminUsersParams {
  search?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}

const fetchAdminUsers = async ({
  search,
  year,
  page = 1,
  pageSize = ADMIN_USERS_PAGE_SIZE,
}: UseQueryAdminUsersParams): Promise<AdminUsersResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set("search", search);
  if (year) params.set("year", String(year));

  const res = await fetch(`/api/admin/users?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load users");
  return adminUsersResponseSchema.parse(await res.json());
};

export const useQueryAdminUsers = ({
  search,
  year,
  page = 1,
  pageSize = ADMIN_USERS_PAGE_SIZE,
}: UseQueryAdminUsersParams = {}) =>
  useQuery(
    queryOptions({
      queryKey: ["admin-users", search, year, page, pageSize] as const,
      queryFn: () => fetchAdminUsers({ search, year, page, pageSize }),
    })
  );
