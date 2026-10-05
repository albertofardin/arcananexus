// eslint-disable-next-line import/named -- RenderOptions exists; import/named's resolver mis-parses this generic type export
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactElement } from "react";

// Create a query client for tests
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
        gcTime: 0, // Disable garbage collection
      },
      mutations: {
        retry: false,
      },
    },
  });

interface AllTheProvidersProps {
  children: React.ReactNode;
}

// Wrapper with all providers
function AllTheProviders({ children }: AllTheProvidersProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Custom render function
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything from testing library
export * from "@testing-library/react";

// Override render method
export { customRender as render };
