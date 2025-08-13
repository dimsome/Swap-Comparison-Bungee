
import { z } from "zod";

export const insertUserSchema = z.object({
  username: z.string().min(1).max(255),
  email: z.string().email(),
});

export const insertSwapProviderSchema = z.object({
  name: z.string().min(1).max(255),
  apiEndpoint: z.string().url(),
  apiKey: z.string().nullable().optional(),
});

export type User = {
  id: string;
  username: string;
  email: string;
};

export type InsertUser = z.infer<typeof insertUserSchema>;

export type SwapProvider = {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string | null;
  isActive: boolean;
};

export type InsertSwapProvider = z.infer<typeof insertSwapProviderSchema>;
