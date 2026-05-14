import axios, { AxiosInstance, AxiosError } from "axios";
import { getApiUrl, getToken } from "./config";

export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${getApiUrl()}/api`,
    timeout: 10000,
    headers: { "Content-Type": "application/json" },
  });

  // Attach token if available
  client.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
}

export function formatApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (!err.response) return "Cannot connect to envsync server. Is it running?";
    const data = err.response.data as { error?: string };
    return data?.error ?? `HTTP ${err.response.status}`;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
