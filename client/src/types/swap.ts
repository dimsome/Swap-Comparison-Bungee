export interface Chain {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

export interface Token {
  symbol: string;
  name: string;
  address: string;
  color: string;
  decimals?: number;
  logoURI?: string | null;
}

export interface SwapProvider {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey?: string;
  isActive: boolean;
}

export interface Quote {
  outputAmount: string;
  estimatedTime: string;
  provider: string;
  route?: string;
  error?: string;
}

export interface SwapPair {
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
}

export interface QuoteResponse {
  [providerName: string]: {
    [amount: string]: Quote;
  };
}
