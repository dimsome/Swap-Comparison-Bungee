import { type User, type InsertUser, type SwapProvider, type InsertSwapProvider } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Swap Provider methods
  getAllSwapProviders(): Promise<SwapProvider[]>;
  getSwapProvider(id: string): Promise<SwapProvider | undefined>;
  createSwapProvider(provider: InsertSwapProvider): Promise<SwapProvider>;
  updateSwapProvider(id: string, updates: Partial<InsertSwapProvider>): Promise<SwapProvider | undefined>;
  deleteSwapProvider(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private swapProviders: Map<string, SwapProvider>;

  constructor() {
    this.users = new Map();
    this.swapProviders = new Map();
    
    // Initialize with default providers (LiFi and Bungee)
    this.initializeDefaultProviders();
  }

  private async initializeDefaultProviders() {
    const lifiProvider: SwapProvider = {
      id: randomUUID(),
      name: "LiFi",
      apiEndpoint: "https://li.quest/v1",
      apiKey: process.env.LIFI_API_KEY || null,
      isActive: true,
    };

    const bungeeProvider: SwapProvider = {
      id: randomUUID(),
      name: "Bungee",
      apiEndpoint: "https://api.socket.tech/v2",
      apiKey: process.env.BUNGEE_API_KEY || null,
      isActive: true,
    };

    this.swapProviders.set(lifiProvider.id, lifiProvider);
    this.swapProviders.set(bungeeProvider.id, bungeeProvider);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllSwapProviders(): Promise<SwapProvider[]> {
    return Array.from(this.swapProviders.values()).filter(provider => provider.isActive);
  }

  async getSwapProvider(id: string): Promise<SwapProvider | undefined> {
    return this.swapProviders.get(id);
  }

  async createSwapProvider(insertProvider: InsertSwapProvider): Promise<SwapProvider> {
    const id = randomUUID();
    const provider: SwapProvider = { 
      ...insertProvider, 
      id,
      isActive: true
    };
    this.swapProviders.set(id, provider);
    return provider;
  }

  async updateSwapProvider(id: string, updates: Partial<InsertSwapProvider>): Promise<SwapProvider | undefined> {
    const existing = this.swapProviders.get(id);
    if (!existing) return undefined;

    const updated: SwapProvider = { ...existing, ...updates };
    this.swapProviders.set(id, updated);
    return updated;
  }

  async deleteSwapProvider(id: string): Promise<boolean> {
    const existing = this.swapProviders.get(id);
    if (!existing) return false;

    // Soft delete by setting isActive to false
    const updated: SwapProvider = { ...existing, isActive: false };
    this.swapProviders.set(id, updated);
    return true;
  }
}

export const storage = new MemStorage();
