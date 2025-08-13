import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { swapApi } from "@/lib/api";
import { Plus, ArrowRight, Search, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Chain, Token, SwapProvider, QuoteResponse } from "@/types/swap";

export default function SwapComparison() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for swap selection
  const [selectedFromChain, setSelectedFromChain] = useState<Chain | null>(null);
  const [selectedFromToken, setSelectedFromToken] = useState<Token | null>(null);
  const [selectedToChain, setSelectedToChain] = useState<Chain | null>(null);
  const [selectedToToken, setSelectedToToken] = useState<Token | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [customAmounts, setCustomAmounts] = useState<number[]>([]);

  // State for dropdowns
  const [fromChainSearch, setFromChainSearch] = useState("");
  const [fromTokenSearch, setFromTokenSearch] = useState("");
  const [toChainSearch, setToChainSearch] = useState("");
  const [toTokenSearch, setToTokenSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // State for provider modal
  const [isAddProviderModalOpen, setIsAddProviderModalOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderApi, setNewProviderApi] = useState("");
  const [newProviderApiKey, setNewProviderApiKey] = useState("");

  // Queries
  const { data: chains = [] } = useQuery({
    queryKey: ["/api/chains"],
    enabled: true,
  });

  const { data: fromTokens = [] } = useQuery({
    queryKey: ["/api/chains", selectedFromChain?.id, "tokens"],
    enabled: !!selectedFromChain,
  });

  const { data: toTokens = [] } = useQuery({
    queryKey: ["/api/chains", selectedToChain?.id, "tokens"],
    enabled: !!selectedToChain,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["/api/providers"],
    enabled: true,
  });

  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["/api/quotes", selectedFromChain?.id, selectedFromToken?.symbol, selectedToChain?.id, selectedToToken?.symbol, customAmounts],
    enabled: !!(selectedFromChain && selectedFromToken && selectedToChain && selectedToToken),
    queryFn: async () => {
      if (!selectedFromChain || !selectedFromToken || !selectedToChain || !selectedToToken) return null;

      const baseAmounts = [1000, 7000, 30000, 120000];
      const allAmounts = [...baseAmounts, ...customAmounts];
      const uniqueAmounts = [...new Set(allAmounts)].sort((a, b) => a - b);

      // Assume swapApi.getQuotes now returns quotes for 'lifi', 'bungee_auto', and 'bungee_manual'
      return swapApi.getQuotes({
        fromChain: selectedFromChain.id,
        fromToken: selectedFromToken.address,
        toChain: selectedToChain.id,
        toToken: selectedToToken.address,
        amounts: uniqueAmounts
      });
    },
    refetchInterval: 10000, // Refresh quotes every 10 seconds
  });

  // Mutations
  const addProviderMutation = useMutation({
    mutationFn: swapApi.createProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      setIsAddProviderModalOpen(false);
      setNewProviderName("");
      setNewProviderApi("");
      setNewProviderApiKey("");
      toast({
        title: "Provider Added",
        description: "Swap provider has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add swap provider.",
        variant: "destructive",
      });
    },
  });

  // Filter functions
  const filteredChains = chains.filter(chain =>
    chain.name.toLowerCase().includes((openDropdown === "fromChain" ? fromChainSearch : toChainSearch).toLowerCase())
  );

  const filteredFromTokens = fromTokens.filter(token =>
    token.symbol.toLowerCase().includes(fromTokenSearch.toLowerCase()) ||
    token.name.toLowerCase().includes(fromTokenSearch.toLowerCase())
  );

  const filteredToTokens = toTokens.filter(token =>
    token.symbol.toLowerCase().includes(toTokenSearch.toLowerCase()) ||
    token.name.toLowerCase().includes(toTokenSearch.toLowerCase())
  );

  // Handle adding custom amount
  const handleAddCustomAmount = () => {
    const amount = parseFloat(customAmount);
    if (amount > 0 && !customAmounts.includes(amount)) {
      setCustomAmounts([...customAmounts, amount].sort((a, b) => a - b));
      setCustomAmount("");
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleAddProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName || !newProviderApi) return;

    addProviderMutation.mutate({
      name: newProviderName,
      apiEndpoint: newProviderApi,
      apiKey: newProviderApiKey || undefined,
    });
  };

  const getDisplayAmounts = useMemo(() => {
    const baseAmounts = [1000, 7000, 30000, 120000];
    const allAmounts = [...baseAmounts, ...customAmounts];
    return [...new Set(allAmounts)].sort((a, b) => a - b);
  }, [customAmounts]);

  const formatAmount = (amount: number) => {
    if (amount >= 1000) {
      return `$${amount / 1000}k`;
    }
    return `$${amount}`;
  };

  const getTokenAmountForUSD = (usdAmount: number, tokenSymbol: string, providerQuotes: any) => {
    if (!tokenSymbol || !providerQuotes) return "";

    const amountKey = formatAmount(usdAmount);

    // Try to get from any provider that has inputTokenAmount calculated
    const providers = ['lifi', 'bungee_auto', 'bungee_manual']; // Include all relevant providers

    for (const provider of providers) {
      if (providerQuotes[provider] && providerQuotes[provider][amountKey]) {
        const quote = providerQuotes[provider][amountKey];

        // Use the backend calculated inputTokenAmount (real-time price based)
        if (quote.inputTokenAmount && quote.inputTokenAmount !== "0") {
          const tokenAmount = parseFloat(quote.inputTokenAmount);

          if (!isNaN(tokenAmount) && tokenAmount > 0) {
            if (tokenAmount >= 1000) {
              return tokenAmount.toFixed(0);
            } else if (tokenAmount >= 1) {
              return tokenAmount.toFixed(2);
            } else if (tokenAmount >= 0.01) {
              return tokenAmount.toFixed(3);
            } else {
              return tokenAmount.toFixed(6);
            }
          }
        }

        // Fallback: calculate using tokenPrice if available
        if (quote.tokenPrice && quote.tokenPrice > 0) {
          const tokenAmount = usdAmount / quote.tokenPrice;

          if (tokenAmount >= 1000) {
            return tokenAmount.toFixed(0);
          } else if (tokenAmount >= 1) {
            return tokenAmount.toFixed(2);
          } else if (tokenAmount >= 0.01) {
            return tokenAmount.toFixed(3);
          } else {
            return tokenAmount.toFixed(6);
          }
        }
      }
    }

    // Last resort - return "calculating..."
    return "calculating...";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <ExternalLink className="h-6 w-6 text-primary mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">Swap Comparison</h1>
            </div>

            <Button
              onClick={() => setIsAddProviderModalOpen(true)}
              className="bg-primary hover:bg-blue-700 text-white flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Swap Selection Card */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Select Swap Pair</h2>

            <div className="flex flex-col lg:flex-row lg:items-end lg:space-x-6 space-y-6 lg:space-y-0">
              {/* From Token Section */}
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4">
                  {/* From Chain Dropdown */}
                  <div>
                    <Label className="block text-sm font-medium text-gray-700 mb-2">From Chain</Label>
                    <div className="relative">
                      <Button
                        variant="outline"
                        className="w-full justify-between h-12"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === "fromChain" ? null : "fromChain");
                        }}
                      >
                        {selectedFromChain ? (
                          <div className="flex items-center">
                            <div className={`w-6 h-6 bg-gradient-to-r ${selectedFromChain.color} rounded-full mr-3`}></div>
                            <span>{selectedFromChain.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Select chain</span>
                        )}
                        <ChevronDown className="h-4 w-4" />
                      </Button>

                      {openDropdown === "fromChain" && (
                        <div className="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                          <div className="p-2">
                            <Input
                              placeholder="Search chains..."
                              value={fromChainSearch}
                              onChange={(e) => setFromChainSearch(e.target.value)}
                              className="w-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredChains.map((chain) => (
                              <button
                                key={chain.id}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center"
                                onClick={() => {
                                  setSelectedFromChain(chain);
                                  setSelectedFromToken(null);
                                  setOpenDropdown(null);
                                  setFromChainSearch("");
                                }}
                              >
                                <div className={`w-6 h-6 bg-gradient-to-r ${chain.color} rounded-full mr-3`}></div>
                                <span>{chain.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* From Token Dropdown */}
                  <div>
                    <Label className="block text-sm font-medium text-gray-700 mb-2">From Token</Label>
                    <div className="relative">
                      <Button
                        variant="outline"
                        className="w-full justify-between h-12"
                        disabled={!selectedFromChain}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === "fromToken" ? null : "fromToken");
                        }}
                      >
                        {selectedFromToken ? (
                          <div className="flex items-center">
                            <div className={`w-6 h-6 bg-gradient-to-r ${selectedFromToken.color} rounded-full mr-3`}></div>
                            <span>{selectedFromToken.symbol}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Select token</span>
                        )}
                        <ChevronDown className="h-4 w-4" />
                      </Button>

                      {openDropdown === "fromToken" && (
                        <div className="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                          <div className="p-2">
                            <Input
                              placeholder="Search tokens..."
                              value={fromTokenSearch}
                              onChange={(e) => setFromTokenSearch(e.target.value)}
                              className="w-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredFromTokens.map((token) => (
                              <button
                                key={token.address}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                onClick={() => {
                                  setSelectedFromToken(token);
                                  setOpenDropdown(null);
                                  setFromTokenSearch("");
                                }}
                              >
                                <div className="flex items-center">
                                  <div className={`w-6 h-6 bg-gradient-to-r ${token.color} rounded-full mr-3`}></div>
                                  <span>{token.symbol}</span>
                                </div>
                                <span className="text-gray-500 text-sm">{token.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Arrow Icon */}
              <div className="flex justify-center lg:justify-start">
                <div className="bg-gray-100 rounded-full p-3">
                  <ArrowRight className="h-5 w-5 text-gray-600" />
                </div>
              </div>

              {/* To Token Section */}
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4">
                  {/* To Chain Dropdown */}
                  <div>
                    <Label className="block text-sm font-medium text-gray-700 mb-2">To Chain</Label>
                    <div className="relative">
                      <Button
                        variant="outline"
                        className="w-full justify-between h-12"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === "toChain" ? null : "toChain");
                        }}
                      >
                        {selectedToChain ? (
                          <div className="flex items-center">
                            <div className={`w-6 h-6 bg-gradient-to-r ${selectedToChain.color} rounded-full mr-3`}></div>
                            <span>{selectedToChain.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Select chain</span>
                        )}
                        <ChevronDown className="h-4 w-4" />
                      </Button>

                      {openDropdown === "toChain" && (
                        <div className="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                          <div className="p-2">
                            <Input
                              placeholder="Search chains..."
                              value={toChainSearch}
                              onChange={(e) => setToChainSearch(e.target.value)}
                              className="w-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredChains.map((chain) => (
                              <button
                                key={chain.id}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center"
                                onClick={() => {
                                  setSelectedToChain(chain);
                                  setSelectedToToken(null);
                                  setOpenDropdown(null);
                                  setToChainSearch("");
                                }}
                              >
                                <div className={`w-6 h-6 bg-gradient-to-r ${chain.color} rounded-full mr-3`}></div>
                                <span>{chain.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* To Token Dropdown */}
                  <div>
                    <Label className="block text-sm font-medium text-gray-700 mb-2">To Token</Label>
                    <div className="relative">
                      <Button
                        variant="outline"
                        className="w-full justify-between h-12"
                        disabled={!selectedToChain}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === "toToken" ? null : "toToken");
                        }}
                      >
                        {selectedToToken ? (
                          <div className="flex items-center">
                            <div className={`w-6 h-6 bg-gradient-to-r ${selectedToToken.color} rounded-full mr-3`}></div>
                            <span>{selectedToToken.symbol}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Select token</span>
                        )}
                        <ChevronDown className="h-4 w-4" />
                      </Button>

                      {openDropdown === "toToken" && (
                        <div className="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                          <div className="p-2">
                            <Input
                              placeholder="Search tokens..."
                              value={toTokenSearch}
                              onChange={(e) => setToTokenSearch(e.target.value)}
                              className="w-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredToTokens.map((token) => (
                              <button
                                key={token.address}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                onClick={() => {
                                  setSelectedToToken(token);
                                  setOpenDropdown(null);
                                  setToTokenSearch("");
                                }}
                              >
                                <div className="flex items-center">
                                  <div className={`w-6 h-6 bg-gradient-to-r ${token.color} rounded-full mr-3`}></div>
                                  <span>{token.symbol}</span>
                                </div>
                                <span className="text-gray-500 text-sm">{token.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom Amount Section */}
              <div className="lg:w-64">
                <Label className="block text-sm font-medium text-gray-700 mb-2">Custom Amount (Optional)</Label>
                <div className="flex">
                  <Input
                    type="number"
                    min="0.01"
                    step="any"
                    placeholder="Enter amount (e.g., 500 or 1.5)"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="rounded-r-none"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCustomAmount();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddCustomAmount}
                    className="bg-accent hover:bg-green-600 rounded-l-none"
                    disabled={!customAmount || parseFloat(customAmount) <= 0}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {customAmounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {customAmounts.map((amount) => (
                      <span
                        key={amount}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-accent text-white cursor-pointer"
                        onClick={() => setCustomAmounts(customAmounts.filter(a => a !== amount))}
                      >
                        {formatAmount(amount)} ×
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comparison Table */}
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Rate Comparison</h2>
              <p className="text-sm text-gray-600 mt-1">Best rates across different swap amounts</p>
            </div>

            {quotesLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
                <span className="text-gray-600">Loading rates...</span>
              </div>
            )}

            {!quotesLoading && (!selectedFromChain || !selectedFromToken || !selectedToChain || !selectedToToken) && (
              <div className="text-center py-12">
                <ExternalLink className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No rates available</h3>
                <p className="text-gray-600">Select token pairs to see comparison rates</p>
              </div>
            )}

            {!quotesLoading && quotes && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Amount</TableHead>
                      <TableHead className="text-center min-w-[200px]">
                        <div className="flex flex-col items-center gap-2">
                          <span className="font-semibold">LiFi</span>
                          <div className="text-xs text-muted-foreground">
                            Multi-chain liquidity aggregator
                          </div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center min-w-[200px]">
                        <div className="flex flex-col items-center gap-2">
                          <span className="font-semibold">Bungee Auto</span>
                          <div className="text-xs text-muted-foreground">
                            Fastest recommended route
                          </div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center min-w-[200px]">
                        <div className="flex flex-col items-center gap-2">
                          <span className="font-semibold">Bungee Manual</span>
                          <div className="text-xs text-muted-foreground">
                            Best rate alternative route
                          </div>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getDisplayAmounts.map((amount) => {
                      const amountKey = formatAmount(amount);

                      // Get quotes for all three providers
                      const lifiQuote = quotes.lifi?.[amountKey];
                      const bungeeAutoQuote = quotes.bungee_auto?.[amountKey];
                      const bungeeManualQuote = quotes.bungee_manual?.[amountKey];

                      // Calculate best rate across all three
                      const allValidQuotes = [lifiQuote, bungeeAutoQuote, bungeeManualQuote].filter(q => q && !q.error && parseFloat(q.outputAmount || "0") > 0);
                      const bestAmount = allValidQuotes.length > 0 ? Math.max(...allValidQuotes.map(q => parseFloat(q.outputAmount || "0"))) : 0;

                      const renderQuoteCell = (quote: any, providerName: string) => {
                        if (!quote) {
                          return (
                            <TableCell className="text-center">
                              <div className="flex flex-col gap-1">
                                <div className="text-sm text-muted-foreground">Loading...</div>
                              </div>
                            </TableCell>
                          );
                        }

                        if (quote.error) {
                          // Handle specific "service unavailable" error
                          const errorMessage = quote.error === "service unavailable" ? "Service Unavailable (Code: 503)" : quote.error;
                          return (
                            <TableCell className="text-center">
                              <div className="flex flex-col gap-1">
                                <div className="text-sm text-red-500">{errorMessage}</div>
                              </div>
                            </TableCell>
                          );
                        }

                        const outputAmount = parseFloat(quote.outputAmount || "0");
                        const isBest = outputAmount === bestAmount && outputAmount > 0;

                        return (
                          <TableCell className="text-center">
                            <div className="flex flex-col gap-1">
                              <div className={`text-sm font-medium ${isBest ? 'text-green-600 font-bold' : ''}`}>
                                {outputAmount > 0 ? `${outputAmount.toFixed(4)} ${selectedToToken?.symbol}` : "0.0000"}
                                {isBest && outputAmount > 0 && (
                                  <Badge variant="default" className="ml-1 text-xs bg-green-100 text-green-700">
                                    Best
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {quote.estimatedTime}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                via {quote.provider || quote.route || providerName}
                              </div>
                            </div>
                          </TableCell>
                        );
                      };

                      return (
                        <TableRow key={amountKey}>
                          <TableCell className="font-medium">
                            <Badge variant="outline" className="font-mono">
                              {amountKey}
                            </Badge>
                            {selectedFromToken && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {getTokenAmountForUSD(amount, selectedFromToken.symbol, quotes)} {selectedFromToken.symbol}
                              </div>
                            )}
                          </TableCell>
                          {renderQuoteCell(lifiQuote, "LiFi")}
                          {renderQuoteCell(bungeeAutoQuote, "Bungee Auto")}
                          {renderQuoteCell(bungeeManualQuote, "Bungee Manual")}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>

                {/* Refresh Status */}
                {quotes && !quotesLoading && (
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Quotes auto-refresh every 10 seconds</span>
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        <span>Live rates</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add Provider Modal */}
      <Modal
        isOpen={isAddProviderModalOpen}
        onClose={() => setIsAddProviderModalOpen(false)}
        title="Add Swap Provider"
      >
        <form onSubmit={handleAddProvider}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="providerName">Provider Name</Label>
              <Input
                id="providerName"
                type="text"
                required
                placeholder="e.g., 1inch, Paraswap"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="apiEndpoint">API Endpoint</Label>
              <Input
                id="apiEndpoint"
                type="url"
                required
                placeholder="https://api.provider.com/v1"
                value={newProviderApi}
                onChange={(e) => setNewProviderApi(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="apiKey">
                API Key <span className="text-gray-500 font-normal">(Optional)</span>
              </Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Your API key (leave empty if not required)"
                value={newProviderApiKey}
                onChange={(e) => setNewProviderApiKey(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">API key will be securely stored</p>
            </div>
          </div>

          <div className="flex space-x-3 mt-6">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsAddProviderModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-blue-700"
              disabled={addProviderMutation.isPending}
            >
              {addProviderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                "Add Provider"
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}