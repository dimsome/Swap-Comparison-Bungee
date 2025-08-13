import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSwapProviderSchema } from "@shared/schema";
import { z } from "zod";

const chainTokenSchema = z.object({
  fromChain: z.string(),
  fromToken: z.string(),
  toChain: z.string(),
  toToken: z.string(),
  amounts: z.array(z.number()).optional().default([1000, 7000, 30000, 120000])
});

// Helper function to generate consistent colors for chains
function getChainColor(chainName: string): string {
  const colors: { [key: string]: string } = {
    'Ethereum': 'from-purple-600 to-blue-600',
    'Polygon': 'from-orange-500 to-red-500',
    'BNB Chain': 'from-yellow-400 to-yellow-600',
    'Binance Smart Chain': 'from-yellow-400 to-yellow-600',
    'Avalanche': 'from-red-500 to-pink-500',
    'Fantom': 'from-blue-400 to-blue-600',
    'Arbitrum': 'from-blue-500 to-cyan-500',
    'Optimism': 'from-red-400 to-pink-400',
    'Base': 'from-blue-600 to-indigo-600'
  };
  return colors[chainName] || 'from-gray-400 to-gray-600';
}

// Helper function to generate consistent colors for tokens
function getTokenColor(tokenSymbol: string): string {
  const colors: { [key: string]: string } = {
    'USDC': 'from-blue-500 to-purple-500',
    'USDT': 'from-green-500 to-yellow-500',
    'ETH': 'from-gray-600 to-gray-800',
    'WETH': 'from-gray-600 to-gray-800',
    'BTC': 'from-orange-400 to-orange-600',
    'WBTC': 'from-orange-400 to-orange-600',
    'MATIC': 'from-purple-500 to-indigo-500',
    'AVAX': 'from-red-500 to-pink-500',
    'FTM': 'from-blue-400 to-blue-600',
    'BNB': 'from-yellow-400 to-yellow-600'
  };
  return colors[tokenSymbol] || 'from-indigo-400 to-purple-500';
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all swap providers
  app.get("/api/providers", async (req, res) => {
    try {
      const providers = await storage.getAllSwapProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  // Create new swap provider
  app.post("/api/providers", async (req, res) => {
    try {
      const validatedData = insertSwapProviderSchema.parse(req.body);
      const provider = await storage.createSwapProvider(validatedData);
      res.status(201).json(provider);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid provider data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create provider" });
      }
    }
  });

  // Get supported chains from Bungee API (primary) with LiFi as fallback
  app.get("/api/chains", async (req, res) => {
    try {
      // Prioritize Bungee chains
      const bungeeResponse = await fetch("https://public-backend.bungee.exchange/api/v1/supported-chains", {
        headers: { 'Accept': 'application/json' }
      });

      const chainsMap = new Map();

      if (bungeeResponse.ok) {
        const bungeeData = await bungeeResponse.json();
        if (bungeeData.success && bungeeData.result) {
          bungeeData.result.forEach((chain: any) => {
            chainsMap.set(chain.chainId.toString(), {
              id: chain.chainId.toString(),
              name: chain.name,
              color: getChainColor(chain.name),
              icon: chain.icon || null,
              nativeCurrency: chain.nativeCurrency
            });
          });
        }
      }

      // Add LiFi chains as fallback for any missing chains
      try {
        const lifiResponse = await fetch("https://li.quest/v1/chains", {
          headers: { 'Accept': 'application/json' }
        });

        if (lifiResponse.ok) {
          const lifiData = await lifiResponse.json();
          if (lifiData.chains) {
            lifiData.chains.forEach((chain: any) => {
              const chainId = chain.id.toString();
              if (!chainsMap.has(chainId)) {
                chainsMap.set(chainId, {
                  id: chainId,
                  name: chain.name,
                  color: getChainColor(chain.name),
                  icon: chain.logoURI || null
                });
              }
            });
          }
        }
      } catch (lifiError) {
        console.warn("LiFi chains fetch failed:", lifiError);
      }

      const supportedChains = Array.from(chainsMap.values());
      res.json(supportedChains);
    } catch (error) {
      console.error("Error fetching chains:", error);
      res.status(500).json({ error: "Failed to fetch chains" });
    }
  });

  // Get supported tokens from Bungee API (primary) with LiFi as fallback
  app.get("/api/chains/:chainId/tokens", async (req, res) => {
    try {
      const { chainId } = req.params;
      const tokensMap = new Map();

      // Prioritize Bungee tokens
      try {
        const bungeeResponse = await fetch("https://public-backend.bungee.exchange/api/v1/tokens/list", {
          headers: { 'Accept': 'application/json' }
        });

        if (bungeeResponse.ok) {
          const bungeeData = await bungeeResponse.json();
          if (bungeeData.success && bungeeData.result && bungeeData.result[chainId]) {
            bungeeData.result[chainId].forEach((token: any) => {
              tokensMap.set(token.address.toLowerCase(), {
                symbol: token.symbol,
                name: token.name,
                address: token.address,
                color: getTokenColor(token.symbol),
                decimals: token.decimals,
                logoURI: token.logoURI || null,
                source: 'bungee'
              });
            });
          }
        }
      } catch (bungeeError) {
        console.warn("Bungee tokens fetch failed:", bungeeError);
      }

      // Add LiFi tokens as fallback
      try {
        const lifiResponse = await fetch(`https://li.quest/v1/tokens?chains=${chainId}`, {
          headers: { 'Accept': 'application/json' }
        });

        if (lifiResponse.ok) {
          const lifiData = await lifiResponse.json();
          if (lifiData.tokens && lifiData.tokens[chainId]) {
            lifiData.tokens[chainId].forEach((token: any) => {
              const address = token.address.toLowerCase();
              // Only add if not already present from Bungee
              if (!tokensMap.has(address)) {
                tokensMap.set(address, {
                  symbol: token.symbol,
                  name: token.name,
                  address: token.address,
                  color: getTokenColor(token.symbol),
                  decimals: token.decimals,
                  logoURI: token.logoURI || null,
                  source: 'lifi'
                });
              }
            });
          }
        }
      } catch (lifiError) {
        console.warn("LiFi tokens fetch failed:", lifiError);
      }

      const supportedTokens = Array.from(tokensMap.values());
      res.json(supportedTokens);
    } catch (error) {
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  // Get swap quotes from all providers
  app.post("/api/quotes", async (req, res) => {
    try {
      const { fromChain, fromToken, toChain, toToken, amounts } = chainTokenSchema.parse(req.body);
      const providers = await storage.getAllSwapProviders();

      // Log chain IDs and token addresses for debugging
      console.log(`\n🔍 [SWAP ROUTE DEBUG]`);
      console.log(`   From: Chain ID ${fromChain} | Token Address ${fromToken}`);
      console.log(`   To: Chain ID ${toChain} | Token Address ${toToken}`);

      // Fetch real-time prices for fromToken and toToken
      const fromTokenPrice = await getTokenPrice(fromChain, fromToken);
      const toTokenPrice = await getTokenPrice(toChain, toToken); // Fetch price for toToken as well for consistency

      console.log(`Real-time prices: ${fromToken} on ${fromChain} = $${fromTokenPrice}, ${toToken} on ${toChain} = $${toTokenPrice}`);

      const quotes = {};

      const baseAmounts = [1000, 7000, 30000, 120000];
      const allAmounts = [...baseAmounts, ...(amounts || [])];
      const uniqueAmounts = [...new Set(allAmounts)].sort((a, b) => a - b);

      for (const provider of providers) {
        if (provider.name === "LiFi") {
          quotes["lifi"] = {};
          
          for (const usdAmount of uniqueAmounts) {
            const amountKey = formatAmountKey(usdAmount);
            console.log(`\n=== Processing ${amountKey} for ${provider.name} ===`);
            
            quotes["lifi"][amountKey] = await getLiFiQuote(
              fromChain, fromToken, toChain, toToken, usdAmount, provider.apiKey, fromTokenPrice, toTokenPrice
            );
          }
        } else if (provider.name === "Bungee") {
          quotes["bungee_auto"] = {};
          quotes["bungee_manual"] = {};
          
          for (const usdAmount of uniqueAmounts) {
            const amountKey = formatAmountKey(usdAmount);
            console.log(`\n=== Processing ${amountKey} for ${provider.name} ===`);
            
            const bungeeQuotes = await getBungeeQuotesBoth(
              fromChain, fromToken, toChain, toToken, usdAmount, provider.apiKey, fromTokenPrice, toTokenPrice
            );
            
            quotes["bungee_auto"][amountKey] = bungeeQuotes.auto;
            quotes["bungee_manual"][amountKey] = bungeeQuotes.manual;
          }
        }
      }

      res.json(quotes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request data", details: error.errors });
      } else {
        console.error("Error fetching quotes:", error);
        res.status(500).json({ error: "Failed to fetch quotes" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function formatAmountKey(amount: number): string {
  if (amount >= 1000) {
    return `$${amount / 1000}k`;
  }
  return `$${amount}`;
}

async function getQuotesForProvider(
  provider: any,
  fromChain: string,
  fromToken: string,
  toChain: string,
  toToken: string,
  amounts: number[],
  fromTokenPrice?: number, // Added for real-time price
  toTokenPrice?: number   // Added for real-time price
) {
  const quotes = {};

  try {
    if (provider.name === "LiFi") {
      for (const amount of amounts) {
        console.log(`Getting LiFi quote for ${formatAmountKey(amount)}`);
        quotes[formatAmountKey(amount)] = await getLiFiQuote(fromChain, fromToken, toChain, toToken, amount, provider.apiKey, fromTokenPrice, toTokenPrice);
      }
    } else if (provider.name === "Bungee") {
      for (const amount of amounts) {
        console.log(`Getting Bungee quote for ${formatAmountKey(amount)}`);
        quotes[formatAmountKey(amount)] = await getBungeeQuote(fromChain, fromToken, toChain, toToken, amount, provider.apiKey, fromTokenPrice, toTokenPrice);
      }
    } else {
      // Custom provider - would need implementation based on their API
      for (const amount of amounts) {
        quotes[formatAmountKey(amount)] = {
          outputAmount: "0",
          estimatedTime: "N/A",
          provider: "Custom",
          error: "Not implemented"
        };
      }
    }
  } catch (error) {
    console.error(`Error fetching quotes from ${provider.name}:`, error);
    for (const amount of amounts) {
      quotes[formatAmountKey(amount)] = {
        outputAmount: "0",
        estimatedTime: "N/A",
        provider: provider.name,
        error: "Failed to fetch quote",
        inputTokenAmount: "0"
      };
    }
  }

  return quotes;
}

// Helper function to normalize token addresses for consistent handling
function normalizeTokenAddress(token: string, isForLiFi: boolean = false): string {
  const lowerToken = token.toLowerCase();

  // Handle native token addresses
  if (lowerToken === "0x0000000000000000000000000000000000000000" || 
      lowerToken === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    return isForLiFi ? "0x0000000000000000000000000000000000000000" : "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  }

  return token;
}

// Helper function to check if token is native ETH/BNB/MATIC etc
function isNativeToken(token: string): boolean {
  const lowerToken = token.toLowerCase();
  return lowerToken === "0x0000000000000000000000000000000000000000" || 
         lowerToken === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

// Global cache for token prices to avoid repeated API calls
const tokenPriceCache = new Map<string, { price: number, timestamp: number }>();
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Enhanced price fetching with multiple strategies and chainName/tokenSymbol fallbacks
async function getTokenPrice(fromChain: string, fromToken: string): Promise<number> {
  try {
    const cacheKey = `${fromChain}-${fromToken.toLowerCase()}`;

    // Check cache first
    const cachedPrice = tokenPriceCache.get(cacheKey);
    if (cachedPrice && (Date.now() - cachedPrice.timestamp) < PRICE_CACHE_DURATION) {
      console.log(`💾 [CACHE HIT] Chain ${fromChain}, Token ${fromToken} = $${cachedPrice.price}`);
      return cachedPrice.price;
    }

    const normalizedToken = fromToken.toLowerCase();
    console.log(`\n🔍 [PRICE FETCH STARTED] Token: ${fromToken}, Chain: ${fromChain}, Normalized: ${normalizedToken}`);

    // Handle native tokens first with real-time prices
    if (isNativeToken(fromToken)) {
      console.log(`🏠 [NATIVE TOKEN DETECTED] Fetching price for native token on chain ${fromChain}`);
      
      try {
        const nativeTokenSymbols: { [key: string]: string } = {
          '1': 'ethereum',      // ETH
          '56': 'binancecoin',  // BNB  
          '137': 'matic-network', // MATIC
          '43114': 'avalanche-2', // AVAX
          '250': 'fantom',      // FTM
          '42161': 'ethereum',  // ETH on Arbitrum
          '10': 'ethereum',     // ETH on Optimism  
          '8453': 'ethereum',   // ETH on Base
          '130': 'polygon'      // MATIC on Polygon/Uniswap
        };

        const coinId = nativeTokenSymbols[fromChain];
        if (coinId) {
          console.log(`🦎 [COINGECKO NATIVE] Fetching ${coinId} price...`);
          const cgResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, {
            headers: { 'Accept': 'application/json' }
          });

          if (cgResponse.ok) {
            const cgData = await cgResponse.json();
            if (cgData[coinId] && cgData[coinId].usd) {
              const price = cgData[coinId].usd;
              console.log(`✅ [NATIVE SUCCESS] CoinGecko: Chain ${fromChain} = $${price}`);
              tokenPriceCache.set(cacheKey, { price, timestamp: Date.now() });
              return price;
            }
          }
        }
      } catch (cgError) {
        console.warn(`❌ [NATIVE FAILED] CoinGecko error:`, cgError);
      }

      // Fallback native prices (last resort for native tokens)
      const nativePrices: { [key: string]: number } = {
        '1': 3800,    // ETH
        '56': 650,    // BNB
        '137': 1.1,   // MATIC
        '43114': 42,  // AVAX
        '250': 0.9,   // FTM
        '42161': 3800, // ETH - Arbitrum
        '10': 3800,   // ETH - Optimism
        '8453': 3800, // ETH - Base
        '130': 1.1    // MATIC - Uniswap/Polygon
      };

      const fallbackPrice = nativePrices[fromChain];
      if (fallbackPrice) {
        console.log(`⚠️ [NATIVE FALLBACK] Using hardcoded price: Chain ${fromChain} = $${fallbackPrice}`);
        tokenPriceCache.set(cacheKey, { price: fallbackPrice, timestamp: Date.now() });
        return fallbackPrice;
      }
    }

    // Strategy 1: Enhanced Bungee token matching with chainId and address
    console.log(`🌉 [STRATEGY 1] Trying Bungee API for token pricing...`);
    try {
      const tokenListResponse = await fetch("https://public-backend.bungee.exchange/api/v1/tokens/list", {
        headers: { 'Accept': 'application/json' }
      });

      if (tokenListResponse.ok) {
        const tokenData = await tokenListResponse.json();
        if (tokenData.success && tokenData.result && tokenData.result[fromChain]) {
          const tokens = tokenData.result[fromChain];
          console.log(`🔍 [BUNGEE] Found ${tokens.length} tokens for chain ${fromChain}`);

          // Try exact address match first
          let token = tokens.find((t: any) => 
            t.address.toLowerCase() === normalizedToken
          );

          if (token) {
            console.log(`✅ [BUNGEE EXACT] Address match: ${token.symbol} = $${token.priceInUsd}`);
          } else {
            // Try symbol-based matching for well-known tokens
            console.log(`🔍 [BUNGEE SYMBOL] Trying symbol matching for address: ${normalizedToken}`);
            
            // Get the token symbol from our data first
            const tokenSymbol = await getTokenSymbolFromChainData(fromChain, normalizedToken);
            if (tokenSymbol) {
              token = tokens.find((t: any) => 
                t.symbol.toLowerCase() === tokenSymbol.toLowerCase()
              );
              if (token) {
                console.log(`✅ [BUNGEE SYMBOL] Symbol match: ${tokenSymbol} -> ${token.symbol} = $${token.priceInUsd}`);
              }
            }

            // UNI token special handling (the token you mentioned having issues with)
            if (!token && normalizedToken === '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') {
              token = tokens.find((t: any) => 
                t.symbol.toLowerCase() === 'uni'
              );
              if (token) {
                console.log(`✅ [BUNGEE UNI SPECIAL] Found UNI token: $${token.priceInUsd}`);
              }
            }
          }

          if (token) {
            console.log(`🔍 [BUNGEE TOKEN FOUND] ${token.symbol}, priceInUsd: ${token.priceInUsd} (type: ${typeof token.priceInUsd})`);
            
            // Handle undefined, null, or invalid prices better
            if (token.priceInUsd !== undefined && 
                token.priceInUsd !== null && 
                typeof token.priceInUsd === 'number' && 
                token.priceInUsd > 0 && 
                !isNaN(token.priceInUsd)) {
              console.log(`✅ [BUNGEE SUCCESS] ${token.symbol} = $${token.priceInUsd}`);
              tokenPriceCache.set(cacheKey, { price: token.priceInUsd, timestamp: Date.now() });
              return token.priceInUsd;
            } else {
              console.warn(`⚠️ [BUNGEE INVALID PRICE] ${token.symbol} has invalid price: ${token.priceInUsd} (type: ${typeof token.priceInUsd})`);
            }
          }
        }
      }
    } catch (bungeeError) {
      console.warn(`❌ [BUNGEE FAILED]`, bungeeError);
    }

    // Strategy 2: Enhanced LiFi token matching
    console.log(`🔗 [STRATEGY 2] Trying LiFi API for token pricing...`);
    try {
      const lifiResponse = await fetch(`https://li.quest/v1/tokens?chains=${fromChain}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (lifiResponse.ok) {
        const lifiData = await lifiResponse.json();
        if (lifiData.tokens && lifiData.tokens[fromChain]) {
          const tokens = lifiData.tokens[fromChain];
          console.log(`🔍 [LIFI] Found ${tokens.length} tokens for chain ${fromChain}`);

          // Try exact address match first
          let token = tokens.find((t: any) => 
            t.address.toLowerCase() === normalizedToken
          );

          if (token) {
            console.log(`✅ [LIFI EXACT] Address match: ${token.symbol} = $${token.priceUSD}`);
          } else {
            // Try symbol-based matching
            const tokenSymbol = await getTokenSymbolFromChainData(fromChain, normalizedToken);
            if (tokenSymbol) {
              token = tokens.find((t: any) => 
                t.symbol.toLowerCase() === tokenSymbol.toLowerCase()
              );
              if (token) {
                console.log(`✅ [LIFI SYMBOL] Symbol match: ${tokenSymbol} -> ${token.symbol} = $${token.priceUSD}`);
              }
            }

            // UNI token special handling for LiFi as well
            if (!token && normalizedToken === '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') {
              token = tokens.find((t: any) => 
                t.symbol.toLowerCase() === 'uni'
              );
              if (token) {
                console.log(`✅ [LIFI UNI SPECIAL] Found UNI token: $${token.priceUSD}`);
              }
            }
          }

          if (token && token.priceUSD && typeof token.priceUSD === 'number' && token.priceUSD > 0) {
            console.log(`✅ [LIFI SUCCESS] ${token.symbol} = $${token.priceUSD}`);
            tokenPriceCache.set(cacheKey, { price: token.priceUSD, timestamp: Date.now() });
            return token.priceUSD;
          }
        }
      }
    } catch (lifiError) {
      console.warn(`❌ [LIFI FAILED]`, lifiError);
    }

    // Strategy 3: CoinGecko by contract address (enhanced with more mappings)
    console.log(`🦎 [STRATEGY 3] Trying CoinGecko by contract address...`);
    try {
      const knownTokenContracts: { [key: string]: string } = {
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'uniswap', // UNI
        '0x514910771af9ca656af840dff83e8264ecf986ca': 'chainlink', // LINK
        '0xa0b86a33e6e6061b7a5c41c6c7e8b5b9e4a2c5b3': 'usd-coin', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether', // USDT
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'wrapped-bitcoin', // WBTC
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'weth', // WETH
        '0x4200000000000000000000000000000000000042': 'optimism', // OP token on Optimism
        '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 'usd-coin', // USDC on Optimism
        '0x68f180fcce6836688e9084f035309e29bf0a2095': 'wrapped-bitcoin', // WBTC on Optimism
        '0x4200000000000000000000000000000000000006': 'weth', // WETH on Optimism
        // Add more popular tokens across chains
        '0x7f5c764cbc14f9669b88837ca1490cca17c31607': 'usd-coin', // USDC.e on Optimism
        '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6': 'chainlink', // LINK on Optimism
      };

      const coinId = knownTokenContracts[normalizedToken];
      if (coinId) {
        console.log(`🦎 [COINGECKO CONTRACT] Fetching ${coinId} by contract...`);

        const cgResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, {
          headers: { 'Accept': 'application/json' }
        });

        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          if (cgData[coinId] && cgData[coinId].usd) {
            const price = cgData[coinId].usd;
            console.log(`✅ [COINGECKO SUCCESS] ${coinId} = $${price}`);
            tokenPriceCache.set(cacheKey, { price, timestamp: Date.now() });
            return price;
          }
        }
      }
    } catch (cgError) {
      console.warn(`❌ [COINGECKO FAILED]`, cgError);
    }

    // Strategy 4: Try CoinGecko by platform and contract address (new strategy)
    console.log(`🦎 [STRATEGY 4] Trying CoinGecko platforms API...`);
    try {
      const platformMappings: { [key: string]: string } = {
        '1': 'ethereum',
        '56': 'binance-smart-chain',
        '137': 'polygon-pos',
        '43114': 'avalanche',
        '250': 'fantom',
        '42161': 'arbitrum-one',
        '10': 'optimistic-ethereum',
        '8453': 'base'
      };

      const platform = platformMappings[fromChain];
      if (platform && !isNativeToken(fromToken)) {
        console.log(`🦎 [COINGECKO PLATFORM] Trying ${platform}/${normalizedToken}...`);
        const cgResponse = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${normalizedToken}&vs_currencies=usd`, {
          headers: { 'Accept': 'application/json' }
        });

        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          if (cgData[normalizedToken] && cgData[normalizedToken].usd) {
            const price = cgData[normalizedToken].usd;
            console.log(`✅ [COINGECKO PLATFORM SUCCESS] ${normalizedToken} = $${price}`);
            tokenPriceCache.set(cacheKey, { price, timestamp: Date.now() });
            return price;
          }
        }
      }
    } catch (cgError) {
      console.warn(`❌ [COINGECKO PLATFORM FAILED]`, cgError);
    }

    // Strategy 5: Stablecoin detection (these should always be ~$1)
    const stablecoins = [
      '0xa0b86a33e6e6061b7a5c41c6c7e8b5b9e4a2c5b3', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT  
      '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
      '0x4fabb145d64652a948d72533023f6e7a623c7c53', // BUSD
      '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC on BSC
      '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC on Optimism
      '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC.e on Optimism
    ];

    if (stablecoins.includes(normalizedToken)) {
      console.log(`💰 [STABLECOIN DETECTED] Using $1.00 for ${normalizedToken}`);
      tokenPriceCache.set(cacheKey, { price: 1.0, timestamp: Date.now() });
      return 1.0;
    }

    // FINAL FALLBACK - Log comprehensive error info for debugging
    console.error(`\n❌ [ALL STRATEGIES FAILED] for token: ${fromToken}`);
    console.error(`   📊 Chain ID: ${fromChain}`);
    console.error(`   📄 Normalized Address: ${normalizedToken}`);
    console.error(`   🚨 Using emergency fallback price: $1.00`);
    console.error(`   🔧 TO FIX: Add this token to the known mappings in the code`);
    console.error(`   📝 Please report this token: Chain ${fromChain}, Address ${fromToken}\n`);

    const fallbackPrice = 1.0;
    tokenPriceCache.set(cacheKey, { price: fallbackPrice, timestamp: Date.now() });
    return fallbackPrice;

  } catch (error) {
    console.error(`💥 [CRITICAL ERROR] getting price for ${fromToken}:`, error);
    return 1.0;
  }
}

// Helper function to get token symbol from chain data
async function getTokenSymbolFromChainData(chainId: string, tokenAddress: string): Promise<string | null> {
  try {
    // Try to get the symbol from the same APIs but focusing on symbol extraction
    const tokenListResponse = await fetch("https://public-backend.bungee.exchange/api/v1/tokens/list", {
      headers: { 'Accept': 'application/json' }
    });

    if (tokenListResponse.ok) {
      const tokenData = await tokenListResponse.json();
      if (tokenData.success && tokenData.result && tokenData.result[chainId]) {
        const token = tokenData.result[chainId].find((t: any) => 
          t.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        if (token) {
          console.log(`📝 [SYMBOL HELPER] Found symbol: ${token.symbol} for ${tokenAddress}`);
          return token.symbol;
        }
      }
    }
  } catch (error) {
    console.warn(`❌ [SYMBOL HELPER] Failed:`, error);
  }
  return null;
}



async function getLiFiQuote(fromChain: string, fromToken: string, toChain: string, toToken: string, usdAmount: number, apiKey?: string, fromTokenPrice?: number, toTokenPrice?: number) {
  try {
    // Normalize tokens for LiFi (uses 0x0000... for native tokens)
    let lifiFromToken = normalizeTokenAddress(fromToken, true);
    let lifiToToken = normalizeTokenAddress(toToken, true);
    let fromTokenDecimals = 18;
    let toTokenDecimals = 18;

    // Get token details from LiFi token list to determine proper decimals
    try {
      const tokenListResponse = await fetch("https://li.quest/v1/tokens", {
        headers: { 'Accept': 'application/json' }
      });

      if (tokenListResponse.ok) {
        const tokenData = await tokenListResponse.json();
        if (tokenData.tokens) {
          // Check from chain tokens
          const fromChainTokens = tokenData.tokens[fromChain];
          if (fromChainTokens) {
            const fromTokenInfo = fromChainTokens.find((t: any) => 
              t.address.toLowerCase() === lifiFromToken.toLowerCase()
            );
            if (fromTokenInfo) {
              fromTokenDecimals = fromTokenInfo.decimals || 18;
            }
          }

          // Check to chain tokens
          const toChainTokens = tokenData.tokens[toChain];
          if (toChainTokens) {
            const toTokenInfo = toChainTokens.find((t: any) => 
              t.address.toLowerCase() === lifiToToken.toLowerCase()
            );
            if (toTokenInfo) {
              toTokenDecimals = toTokenInfo.decimals || 18;
            }
          }
        }
      }
    } catch (tokenError) {
      console.warn("Failed to fetch LiFi token list:", tokenError);
    }

    // Calculate token amount from USD using real-time price
    let tokenPrice = fromTokenPrice && fromTokenPrice > 0 ? fromTokenPrice : 1;
    let tokenAmount = usdAmount / tokenPrice;

    console.log(`🔗 [LIFI CALCULATION] Converting $${usdAmount} USD to tokens:`);
    console.log(`   💰 Token Price: $${tokenPrice} per token`);
    console.log(`   🔢 Token Amount: ${tokenAmount.toFixed(6)} tokens`);
    console.log(`   📏 Token Decimals: ${fromTokenDecimals}`);

    // Validate token amount
    if (tokenAmount <= 0 || !isFinite(tokenAmount)) {
      console.error(`❌ [LIFI ERROR] Invalid token amount: ${tokenAmount}`);
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "LiFi",
        error: "Invalid amount",
        inputTokenAmount: "0",
        tokenPrice: tokenPrice
      };
    }

    // Convert to proper BigInt string without scientific notation
    const multiplier = BigInt(10) ** BigInt(fromTokenDecimals);
    const tokenAmountBigInt = BigInt(Math.floor(tokenAmount * 1000000)) * multiplier / BigInt(1000000);
    const fromAmount = tokenAmountBigInt.toString();

    console.log(`   🔄 Wei Conversion: ${tokenAmount.toFixed(6)} × 10^${fromTokenDecimals} = ${fromAmount} wei (${fromAmount.length} digits)`);
    console.log(`🚀 [LIFI REQUEST] Sending quote request to LiFi API...`);

    const url = new URL("https://li.quest/v1/quote");
    url.searchParams.append("fromChain", fromChain);
    url.searchParams.append("toChain", toChain);
    url.searchParams.append("fromToken", lifiFromToken);
    url.searchParams.append("toToken", lifiToToken);
    url.searchParams.append("fromAmount", fromAmount);
    url.searchParams.append("fromAddress", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");

    const headers: any = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [LIFI ERROR ${response.status}]:`, errorText);
      
      let userFriendlyError = `Service unavailable (${response.status})`;
      let detailedError = errorText;
      
      try {
        const errorData = JSON.parse(errorText);
        detailedError = errorData.message || errorData.error || errorText;
        
        if (response.status === 429) {
          userFriendlyError = "Rate limited - please wait";
        } else if (response.status === 404) {
          if (errorData.message?.includes("No available quotes")) {
            userFriendlyError = "No routes available";
          } else if (errorData.message?.includes("Price impact")) {
            userFriendlyError = "Amount too large";
          } else {
            userFriendlyError = "Route not found";
          }
        } else if (response.status === 400) {
          if (errorData.message?.includes("isBigNumberish")) {
            userFriendlyError = "Invalid amount format";
          } else {
            userFriendlyError = "Invalid request";
          }
        } else if (response.status === 500) {
          userFriendlyError = `Server error (${response.status})`;
        } else if (response.status === 503) {
          userFriendlyError = `Service unavailable (${response.status})`;
        }
      } catch (parseError) {
        // If we can't parse the error, use status-based message
        if (response.status === 429) userFriendlyError = "Rate limited";
        else if (response.status === 404) userFriendlyError = "No routes found";
        else if (response.status === 400) userFriendlyError = "Bad request";
        else if (response.status === 500) userFriendlyError = `Server error (${response.status})`;
        else if (response.status === 503) userFriendlyError = `Service unavailable (${response.status})`;
        else userFriendlyError = `Error ${response.status}`;
      }

      console.log(`🎯 [LIFI USER ERROR] Status: ${response.status}, User Message: "${userFriendlyError}", Detail: "${detailedError}"`);
      
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "LiFi",
        error: userFriendlyError,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    const data = await response.json();

    if (!data || (!data.estimate && !data.transactionRequest)) {
      const errorMessage = data?.message || data?.error || "No routes found";
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "LiFi",
        error: errorMessage,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    const estimate = data.estimate || {};
    const toAmount = estimate.toAmount || data.toAmount || "0";

    if (toAmount === "0" || !toAmount) {
      const errorMessage = data?.message || data?.error || "Insufficient liquidity";
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "LiFi",
        error: errorMessage,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    const outputAmount = (parseFloat(toAmount) / Math.pow(10, toTokenDecimals)).toFixed(2);

    // Get the tool/bridge name from various possible locations
    const toolName = data.tool?.name || 
                    estimate.tool?.name || 
                    data.toolDetails?.name ||
                    (data.steps && data.steps[0]?.tool?.name) ||
                    "LiFi Bridge";

    console.log(`LiFi quote result: ${outputAmount} via ${toolName} in ${Math.ceil((estimate.executionDuration || data.executionDuration || 120) / 60)} min`);

    return {
      outputAmount,
      estimatedTime: `${Math.ceil((estimate.executionDuration || data.executionDuration || 120) / 60)} min`,
      provider: toolName,
      route: toolName,
      inputTokenAmount: tokenAmount.toFixed(6),
      tokenPrice: tokenPrice
    };
  } catch (error) {
    console.error("LiFi quote error:", error);

    return {
      outputAmount: "0.0000",
      estimatedTime: "N/A",
      provider: "LiFi",
      error: error instanceof Error ? error.message : "Price unavailable",
      inputTokenAmount: "0",
      tokenPrice: 0
    };
  }
}

async function getBungeeQuotesBoth(fromChain: string, fromToken: string, toChain: string, toToken: string, usdAmount: number, apiKey?: string, fromTokenPrice?: number, toTokenPrice?: number) {
  try {
    const userAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

    // Normalize tokens for Bungee (uses 0xEeeee... for native tokens)
    const bungeeFromToken = normalizeTokenAddress(fromToken, false);
    const bungeeToToken = normalizeTokenAddress(toToken, false);

    // Get proper token decimals from Bungee token list
    let fromTokenDecimals = 18;
    let toTokenDecimals = 18;

    try {
      const tokenResponse = await fetch("https://public-backend.bungee.exchange/api/v1/tokens/list", {
        headers: { 'Accept': 'application/json' }
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        if (tokenData.success && tokenData.result) {
          // Check from chain tokens
          const fromChainTokens = tokenData.result[fromChain];
          if (fromChainTokens) {
            const fromTokenInfo = fromChainTokens.find((t: any) => 
              t.address.toLowerCase() === bungeeFromToken.toLowerCase()
            );
            if (fromTokenInfo) {
              fromTokenDecimals = fromTokenInfo.decimals || 18;
            }
          }

          // Check to chain tokens  
          const toChainTokens = tokenData.result[toChain];
          if (toChainTokens) {
            const toTokenInfo = toChainTokens.find((t: any) => 
              t.address.toLowerCase() === bungeeToToken.toLowerCase()
            );
            if (toTokenInfo) {
              toTokenDecimals = toTokenInfo.decimals || 18;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to fetch token info from Bungee:", error);
    }

    // Calculate token amount from USD using real-time price
    let tokenPrice = fromTokenPrice && fromTokenPrice > 0 ? fromTokenPrice : 1;
    let tokenAmount = usdAmount / tokenPrice;

    console.log(`🌉 [BUNGEE CALCULATION] Converting $${usdAmount} USD to tokens:`);
    console.log(`   💰 Token Price: $${tokenPrice} per token`);
    console.log(`   🔢 Token Amount: ${tokenAmount.toFixed(6)} tokens`);
    console.log(`   📏 Token Decimals: ${fromTokenDecimals}`);

    // Validate token amount
    if (tokenAmount <= 0 || !isFinite(tokenAmount)) {
      console.error(`❌ [BUNGEE ERROR] Invalid token amount: ${tokenAmount}`);
      const errorQuote = {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "Invalid amount",
        inputTokenAmount: "0",
        tokenPrice: tokenPrice
      };
      return { auto: errorQuote, manual: errorQuote };
    }

    // Convert to proper BigInt string without scientific notation
    const multiplier = BigInt(10) ** BigInt(fromTokenDecimals);
    const tokenAmountBigInt = BigInt(Math.floor(tokenAmount * 1000000)) * multiplier / BigInt(1000000);
    const fromAmount = tokenAmountBigInt.toString();

    console.log(`   🔄 Wei Conversion: ${tokenAmount.toFixed(6)} × 10^${fromTokenDecimals} = ${fromAmount} wei (${fromAmount.length} digits)`);
    console.log(`🚀 [BUNGEE REQUEST] Sending quote request to Bungee API...`);

    const url = new URL("https://public-backend.bungee.exchange/api/v1/bungee/quote");
    url.searchParams.append("userAddress", userAddress);
    url.searchParams.append("originChainId", fromChain);
    url.searchParams.append("destinationChainId", toChain);
    url.searchParams.append("inputToken", bungeeFromToken);
    url.searchParams.append("inputAmount", fromAmount);
    url.searchParams.append("receiverAddress", userAddress);
    url.searchParams.append("outputToken", bungeeToToken);
    url.searchParams.append("enableManual", "true");
    url.searchParams.append("slippage", "1");

    const headers: any = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url.toString(), { 
      headers,
      method: 'GET'
    });

    console.log(`Bungee response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [BUNGEE ERROR ${response.status}]:`, errorText);
      
      let userFriendlyError = "Service unavailable";
      try {
        const errorData = JSON.parse(errorText);
        if (response.status === 429) {
          userFriendlyError = "Rate limited - please wait";
        } else if (response.status === 400) {
          if (errorData.message?.includes("BigNumberish")) {
            userFriendlyError = "Invalid amount format";
          } else if (errorData.message?.includes("fromAmount")) {
            userFriendlyError = "Amount validation failed";
          } else {
            userFriendlyError = "Invalid request parameters";
          }
        } else if (response.status === 404) {
          userFriendlyError = "Route not available";
        } else if (response.status === 500) {
          if (errorData.message?.includes("BigNumberish")) {
            userFriendlyError = "Amount processing error";
          } else {
            userFriendlyError = "Server error";
          }
        }
      } catch (parseError) {
        if (response.status === 429) userFriendlyError = "Rate limited";
        else if (response.status === 400) userFriendlyError = "Bad request";
        else if (response.status === 404) userFriendlyError = "Not found";
        else if (response.status === 500) userFriendlyError = "Server error";
      }

      console.log(`🎯 [BUNGEE USER ERROR] Showing: "${userFriendlyError}" for status ${response.status}`);
      
      const errorQuote = {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: userFriendlyError,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
      return { auto: errorQuote, manual: errorQuote };
    }

    const data = await response.json();

    if (!data.success) {
      console.error("Bungee API failed:", data);
      const errorMessage = data.message || data.error || "Quote failed";
      const errorQuote = {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: errorMessage,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
      return { auto: errorQuote, manual: errorQuote };
    }

    if (!data.result) {
      console.error("Bungee API no result:", data);
      const errorQuote = {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "No quote available",
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
      return { auto: errorQuote, manual: errorQuote };
    }

    const result = data.result;
    console.log(`📊 [BUNGEE ROUTES] Available route types:`, Object.keys(result));

    // Process Auto Route
    let autoQuote = {
      outputAmount: "0.0000",
      estimatedTime: "N/A",
      provider: "Bungee Auto",
      error: "No auto route",
      inputTokenAmount: tokenAmount.toFixed(6),
      tokenPrice: tokenPrice
    };

    if (result.autoRoute && result.autoRoute.output && result.autoRoute.output.amount) {
      const outputValue = parseFloat(result.autoRoute.output.amount) / Math.pow(10, toTokenDecimals);
      const outputAmount = outputValue.toFixed(4);

      let bridgeName = "Bungee Auto";
      let estimatedTime = "5 min";

      if (result.autoRoute.usedBridgeNames && result.autoRoute.usedBridgeNames.length > 0) {
        bridgeName = `${result.autoRoute.usedBridgeNames[0]} (Auto)`;
      } else if (result.autoRoute.bridgeName) {
        bridgeName = `${result.autoRoute.bridgeName} (Auto)`;
      }

      if (result.autoRoute.estimatedTime) {
        estimatedTime = `${Math.ceil(result.autoRoute.estimatedTime / 60)} min`;
      }

      autoQuote = {
        outputAmount,
        estimatedTime,
        provider: bridgeName,
        route: bridgeName,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };

      console.log(`✅ [BUNGEE AUTO] ${outputAmount} via ${bridgeName} in ${estimatedTime}`);
    }

    // Process Manual Routes
    let manualQuote = {
      outputAmount: "0.0000",
      estimatedTime: "N/A",
      provider: "Bungee Manual",
      error: "No manual routes",
      inputTokenAmount: tokenAmount.toFixed(6),
      tokenPrice: tokenPrice
    };

    if (result.manualRoutes && result.manualRoutes.length > 0) {
      let bestManualRoute = null;
      let bestOutputAmount = 0;

      console.log(`🔍 [BUNGEE MANUAL] Analyzing ${result.manualRoutes.length} manual routes for best rate...`);
      
      for (let i = 0; i < result.manualRoutes.length; i++) {
        const route = result.manualRoutes[i];
        if (route.output && route.output.amount) {
          const outputAmount = parseFloat(route.output.amount);
          console.log(`   Route ${i+1}: ${(outputAmount / Math.pow(10, toTokenDecimals)).toFixed(4)} tokens via ${route.usedBridgeNames?.[0] || route.bridgeName || 'Unknown'}`);
          if (outputAmount > bestOutputAmount) {
            bestOutputAmount = outputAmount;
            bestManualRoute = route;
          }
        }
      }

      if (bestManualRoute) {
        const outputValue = bestOutputAmount / Math.pow(10, toTokenDecimals);
        const outputAmount = outputValue.toFixed(4);

        let bridgeName = "Bungee Manual";
        let estimatedTime = "5 min";

        if (bestManualRoute.usedBridgeNames && bestManualRoute.usedBridgeNames.length > 0) {
          bridgeName = `${bestManualRoute.usedBridgeNames[0]} (Manual)`;
        } else if (bestManualRoute.bridgeName) {
          bridgeName = `${bestManualRoute.bridgeName} (Manual)`;
        } else if (bestManualRoute.steps && bestManualRoute.steps.length > 0) {
          const firstStep = bestManualRoute.steps[0];
          if (firstStep.protocol?.displayName) {
            bridgeName = `${firstStep.protocol.displayName} (Manual)`;
          } else if (firstStep.protocolName) {
            bridgeName = `${firstStep.protocolName} (Manual)`;
          }
        }

        if (bestManualRoute.estimatedTime) {
          estimatedTime = `${Math.ceil(bestManualRoute.estimatedTime / 60)} min`;
        }

        // Extract the actual provider name without "(Manual)" suffix for display
        let displayProviderName = bridgeName;
        if (bestManualRoute.usedBridgeNames && bestManualRoute.usedBridgeNames.length > 0) {
          displayProviderName = bestManualRoute.usedBridgeNames[0]; // Use raw provider name
        } else if (bestManualRoute.bridgeName) {
          displayProviderName = bestManualRoute.bridgeName;
        } else if (bestManualRoute.steps && bestManualRoute.steps.length > 0) {
          const firstStep = bestManualRoute.steps[0];
          if (firstStep.protocol?.displayName) {
            displayProviderName = firstStep.protocol.displayName;
          } else if (firstStep.protocolName) {
            displayProviderName = firstStep.protocolName;
          }
        }

        manualQuote = {
          outputAmount,
          estimatedTime,
          provider: displayProviderName, // Show actual provider name, not "Bungee Manual"
          route: bridgeName, // Keep the full route info for debugging
          inputTokenAmount: tokenAmount.toFixed(6),
          tokenPrice: tokenPrice
        };

        console.log(`✅ [BUNGEE MANUAL] ${outputAmount} via ${displayProviderName} in ${estimatedTime}`);
      }
    }

    return { auto: autoQuote, manual: manualQuote };

  } catch (error) {
    console.error("Bungee quotes error:", error);

    const errorQuote = {
      outputAmount: "0.0000",
      estimatedTime: "N/A",
      provider: "Bungee",
      error: error instanceof Error ? error.message : "Price unavailable",
      inputTokenAmount: "0",
      tokenPrice: 0
    };

    return { auto: errorQuote, manual: errorQuote };
  }
}

async function getBungeeQuote(fromChain: string, fromToken: string, toChain: string, toToken: string, usdAmount: number, apiKey?: string, fromTokenPrice?: number, toTokenPrice?: number) {
  try {
    const userAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

    // Normalize tokens for Bungee (uses 0xEeeee... for native tokens)
    const bungeeFromToken = normalizeTokenAddress(fromToken, false);
    const bungeeToToken = normalizeTokenAddress(toToken, false);

    // Get proper token decimals from Bungee token list
    let fromTokenDecimals = 18;
    let toTokenDecimals = 18;

    try {
      const tokenResponse = await fetch("https://public-backend.bungee.exchange/api/v1/tokens/list", {
        headers: { 'Accept': 'application/json' }
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        if (tokenData.success && tokenData.result) {
          // Check from chain tokens
          const fromChainTokens = tokenData.result[fromChain];
          if (fromChainTokens) {
            const fromTokenInfo = fromChainTokens.find((t: any) => 
              t.address.toLowerCase() === bungeeFromToken.toLowerCase()
            );
            if (fromTokenInfo) {
              fromTokenDecimals = fromTokenInfo.decimals || 18;
            }
          }

          // Check to chain tokens  
          const toChainTokens = tokenData.result[toChain];
          if (toChainTokens) {
            const toTokenInfo = toChainTokens.find((t: any) => 
              t.address.toLowerCase() === bungeeToToken.toLowerCase()
            );
            if (toTokenInfo) {
              toTokenDecimals = toTokenInfo.decimals || 18;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to fetch token info from Bungee:", error);
    }

    // Calculate token amount from USD using real-time price
    let tokenPrice = fromTokenPrice && fromTokenPrice > 0 ? fromTokenPrice : 1;
    let tokenAmount = usdAmount / tokenPrice;

    console.log(`🌉 [BUNGEE CALCULATION] Converting $${usdAmount} USD to tokens:`);
    console.log(`   💰 Token Price: $${tokenPrice} per token`);
    console.log(`   🔢 Token Amount: ${tokenAmount.toFixed(6)} tokens`);
    console.log(`   📏 Token Decimals: ${fromTokenDecimals}`);

    // Validate token amount
    if (tokenAmount <= 0 || !isFinite(tokenAmount)) {
      console.error(`❌ [BUNGEE ERROR] Invalid token amount: ${tokenAmount}`);
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "Invalid amount",
        inputTokenAmount: "0",
        tokenPrice: tokenPrice
      };
    }

    // Convert to proper BigInt string without scientific notation
    const multiplier = BigInt(10) ** BigInt(fromTokenDecimals);
    const tokenAmountBigInt = BigInt(Math.floor(tokenAmount * 1000000)) * multiplier / BigInt(1000000);
    const fromAmount = tokenAmountBigInt.toString();

    console.log(`   🔄 Wei Conversion: ${tokenAmount.toFixed(6)} × 10^${fromTokenDecimals} = ${fromAmount} wei (${fromAmount.length} digits)`);
    console.log(`🚀 [BUNGEE REQUEST] Sending quote request to Bungee API...`);

    const url = new URL("https://public-backend.bungee.exchange/api/v1/bungee/quote");
    url.searchParams.append("userAddress", userAddress);
    url.searchParams.append("originChainId", fromChain);
    url.searchParams.append("destinationChainId", toChain);
    url.searchParams.append("inputToken", bungeeFromToken);
    url.searchParams.append("inputAmount", fromAmount);
    url.searchParams.append("receiverAddress", userAddress);
    url.searchParams.append("outputToken", bungeeToToken);
    // Add parameters to get more routes
    url.searchParams.append("enableManual", "true");
    url.searchParams.append("slippage", "1");

    const headers: any = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url.toString(), { 
      headers,
      method: 'GET'
    });

    console.log(`Bungee response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [BUNGEE ERROR ${response.status}]:`, errorText);
      
      let userFriendlyError = "Service unavailable";
      try {
        const errorData = JSON.parse(errorText);
        if (response.status === 429) {
          userFriendlyError = "Rate limited - please wait";
        } else if (response.status === 400) {
          if (errorData.message?.includes("BigNumberish")) {
            userFriendlyError = "Invalid amount format";
          } else if (errorData.message?.includes("fromAmount")) {
            userFriendlyError = "Amount validation failed";
          } else {
            userFriendlyError = "Invalid request parameters";
          }
        } else if (response.status === 404) {
          userFriendlyError = "Route not available";
        } else if (response.status === 500) {
          if (errorData.message?.includes("BigNumberish")) {
            userFriendlyError = "Amount processing error";
          } else {
            userFriendlyError = "Server error";
          }
        }
      } catch (parseError) {
        // Fallback to status-based messages
        if (response.status === 429) userFriendlyError = "Rate limited";
        else if (response.status === 400) userFriendlyError = "Bad request";
        else if (response.status === 404) userFriendlyError = "Not found";
        else if (response.status === 500) userFriendlyError = "Server error";
      }

      console.log(`🎯 [BUNGEE USER ERROR] Showing: "${userFriendlyError}" for status ${response.status}`);
      
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: userFriendlyError,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    const data = await response.json();

    if (!data.success) {
      console.error("Bungee API failed:", data);
      const errorMessage = data.message || data.error || "Quote failed";
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: errorMessage,
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    if (!data.result) {
      console.error("Bungee API no result:", data);
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "No quote available",
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    const result = data.result;
    console.log(`📊 [BUNGEE ROUTES] Available route types:`, Object.keys(result));

    // Analyze what Bungee provides for this query
    let routeAnalysis = {
      hasAutoRoute: !!(result.autoRoute && result.autoRoute.output),
      manualRoutesCount: result.manualRoutes ? result.manualRoutes.length : 0,
      legacyRoutesCount: result.routes ? result.routes.length : 0
    };

    console.log(`🔍 [BUNGEE ANALYSIS] Route availability:`, routeAnalysis);

    if (routeAnalysis.hasAutoRoute) {
      console.log(`⚡ [BUNGEE AUTO] AutoRoute available (fastest/recommended)`);
    }
    if (routeAnalysis.manualRoutesCount > 0) {
      console.log(`🛠️ [BUNGEE MANUAL] ${routeAnalysis.manualRoutesCount} manual routes available (alternative options)`);
    }

    // Check for different possible route structures with priority order
    let bestRoute = null;
    let routeType = "";

    // 1. Check autoRoute first (this is the preferred/fastest route)
    if (result.autoRoute && result.autoRoute.output) {
      bestRoute = result.autoRoute;
      routeType = "Auto (Fastest)";
      console.log(`✅ [BUNGEE SELECTED] Using autoRoute (Bungee's recommended fastest route)`);
    }
    // 2. Check manualRoutes (alternative routes, potentially better rates)
    else if (result.manualRoutes && result.manualRoutes.length > 0) {
      // Find the best manual route (highest output amount)
      let bestManualRoute = null;
      let bestOutputAmount = 0;

      console.log(`🔍 [BUNGEE MANUAL] Analyzing ${result.manualRoutes.length} manual routes for best rate...`);
      
      for (let i = 0; i < result.manualRoutes.length; i++) {
        const route = result.manualRoutes[i];
        if (route.output && route.output.amount) {
          const outputAmount = parseFloat(route.output.amount);
          console.log(`   Route ${i+1}: ${(outputAmount / Math.pow(10, toTokenDecimals)).toFixed(4)} tokens`);
          if (outputAmount > bestOutputAmount) {
            bestOutputAmount = outputAmount;
            bestManualRoute = route;
          }
        }
      }

      if (bestManualRoute) {
        bestRoute = bestManualRoute;
        routeType = "Manual (Best Rate)";
        console.log(`✅ [BUNGEE SELECTED] Using best manual route (highest output: ${(bestOutputAmount / Math.pow(10, toTokenDecimals)).toFixed(4)} tokens)`);
      }
    }
    // 3. Check routes array (legacy)
    else if (result.routes && result.routes.length > 0) {
      bestRoute = result.routes[0];
      routeType = "Legacy";
      console.log(`✅ [BUNGEE SELECTED] Using legacy routes[0]`);
    }

    // Log what Bungee provides: Fastest vs Best Price
    if (routeAnalysis.hasAutoRoute && routeAnalysis.manualRoutesCount > 0) {
      console.log(`💡 [BUNGEE INFO] Bungee provides BOTH fastest route (auto) AND alternative routes (manual) for better rates`);
    } else if (routeAnalysis.hasAutoRoute) {
      console.log(`💡 [BUNGEE INFO] Bungee provides fastest route only (auto)`);
    } else if (routeAnalysis.manualRoutesCount > 0) {
      console.log(`💡 [BUNGEE INFO] Bungee provides alternative routes only (manual)`);
    }

    if (!bestRoute) {
      console.error("Bungee: No routes available. Available keys:", Object.keys(result));
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "No routes found",
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    // Get output amount from the route
    let outputAmountStr = "0";

    console.log("Checking for output amount in bestRoute:", Object.keys(bestRoute));

    if (bestRoute.output && bestRoute.output.amount) {
      outputAmountStr = bestRoute.output.amount;
      console.log("Found output.amount:", outputAmountStr);
    } else if (bestRoute.outputAmount) {
      outputAmountStr = bestRoute.outputAmount;
      console.log("Found outputAmount:", outputAmountStr);
    } else if (bestRoute.toAmount) {
      outputAmountStr = bestRoute.toAmount;
      console.log("Found toAmount:", outputAmountStr);
    } else if (bestRoute.returnAmount) {
      outputAmountStr = bestRoute.returnAmount;
      console.log("Found returnAmount:", outputAmountStr);
    }

    if (!outputAmountStr || outputAmountStr === "0") {
      console.error("No valid output amount found. BestRoute keys:", Object.keys(bestRoute));
      if (bestRoute.output) {
        console.error("Output object keys:", Object.keys(bestRoute.output));
      }
      return {
        outputAmount: "0.0000",
        estimatedTime: "N/A",
        provider: "Bungee",
        error: "No output amount",
        inputTokenAmount: tokenAmount.toFixed(6),
        tokenPrice: tokenPrice
      };
    }

    // Parse the output amount with correct decimals
    const outputValue = parseFloat(outputAmountStr) / Math.pow(10, toTokenDecimals);
    const outputAmount = outputValue.toFixed(4); // Round to 4 decimal places

    console.log(`Bungee output calculation: ${outputAmountStr} / 10^${toTokenDecimals} = ${outputAmount}`);

    // Extract bridge/provider information from the route
    let bridgeName = "Bungee";
    let estimatedTime = "5 min";

    // Try to get provider name from various locations
    if (bestRoute.usedBridgeNames && bestRoute.usedBridgeNames.length > 0) {
      bridgeName = bestRoute.usedBridgeNames[0];
    } else if (bestRoute.bridgeName) {
      bridgeName = bestRoute.bridgeName;
    } else if (bestRoute.steps && bestRoute.steps.length > 0) {
      const firstStep = bestRoute.steps[0];
      if (firstStep.protocol?.displayName) {
        bridgeName = firstStep.protocol.displayName;
      } else if (firstStep.protocolName) {
        bridgeName = firstStep.protocolName;
      } else if (firstStep.tool?.name) {
        bridgeName = firstStep.tool.name;
      }
    } else if (bestRoute.protocol?.displayName) {
      bridgeName = bestRoute.protocol.displayName;
    } else if (bestRoute.bridgeId) {
      bridgeName = bestRoute.bridgeId;
    }

    // Extract time estimate
    if (bestRoute.estimatedTime) {
      estimatedTime = `${Math.ceil(bestRoute.estimatedTime / 60)} min`;
    } else if (bestRoute.serviceTime) {
      estimatedTime = `${Math.ceil(bestRoute.serviceTime / 60)} min`;
    } else if (bestRoute.estimatedProcessingTimeInSeconds) {
      estimatedTime = `${Math.ceil(bestRoute.estimatedProcessingTimeInSeconds / 60)} min`;
    }

    console.log(`Bungee quote result: ${outputAmount} via ${bridgeName} in ${estimatedTime}`);

    return {
      outputAmount,
      estimatedTime,
      provider: bridgeName,
      route: bridgeName,
      inputTokenAmount: tokenAmount.toFixed(6),
      tokenPrice: tokenPrice
    };
  } catch (error) {
    console.error("Bungee quote error:", error);

    return {
      outputAmount: "0.0000",
      estimatedTime: "N/A",
      provider: "Bungee",
      error: error instanceof Error ? error.message : "Price unavailable",
      inputTokenAmount: "0",
      tokenPrice: 0
    };
  }
}