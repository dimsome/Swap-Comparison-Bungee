import { apiRequest } from "./queryClient";
import type { SwapProvider, Chain, Token, QuoteResponse, SwapPair } from "../types/swap";

export const swapApi = {
  // Provider management
  getProviders: async (): Promise<SwapProvider[]> => {
    const response = await apiRequest("GET", "/api/providers");
    return response.json();
  },

  createProvider: async (provider: { name: string; apiEndpoint: string; apiKey?: string }): Promise<SwapProvider> => {
    const response = await apiRequest("POST", "/api/providers", provider);
    return response.json();
  },

  // Chain and token data
  getChains: async (): Promise<Chain[]> => {
    const response = await apiRequest("GET", "/api/chains");
    return response.json();
  },

  getTokensForChain: async (chainId: string): Promise<Token[]> => {
    const response = await apiRequest("GET", `/api/chains/${chainId}/tokens`);
    return response.json();
  },

  // Quote fetching
  getQuotes: async (swapPair: SwapPair & { amounts?: number[] }): Promise<QuoteResponse> => {
    const response = await apiRequest("POST", "/api/quotes", swapPair);
    return response.json();
  },
};
