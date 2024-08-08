import React, { useEffect, useState, useCallback } from "react";
import io from 'socket.io-client';
import "./App.css";

const SOCKET_SERVER_URL = "https://test-server-9sbj.onrender.com";

function App() {
  const [marketData, setMarketData] = useState({});
  const [error, setError] = useState(null);
  const [symbols, setSymbols] = useState(["GOLD", "SILVER","PLATINUM"]); // Default symbols

  const fetchMarketData = useCallback((symbols) => {
    const socket = io(SOCKET_SERVER_URL, {
      query: { secret: import.meta.env.VITE_ACCESS_KEY }, // Pass secret key as query parameter
    });

    socket.on("connect", () => {
      console.log("Connected to WebSocket server");
      socket.emit("request-data", symbols);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
    });

    socket.on("market-data", (data) => {
      if (data && data.symbol) {
        setMarketData(prevData => ({
          ...prevData,
          [data.symbol]: {
            ...prevData[data.symbol],
            ...data,
            // Compare current and previous bid to determine color
            bidChanged: prevData[data.symbol] && data.bid !== prevData[data.symbol].bid 
              ? (data.bid > prevData[data.symbol].bid ? 'up' : 'down') 
              : null,
          }
        }));
      } else {
        console.warn("Received malformed market data:", data);
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
      setError("An error occurred while receiving data");
    });

    return () => {
      socket.disconnect();
    };
  }, [symbols]);

  useEffect(() => {
    const cleanup = fetchMarketData(symbols);
    return cleanup;
  }, [symbols, fetchMarketData]);

  // Utility function to determine background color based on bid change
  const getBidTextColor = (change) => {
    if (change === 'up') {
      return "bg-green-300 text-green-800";
    } else if (change === 'down') {
      return "bg-red-300 text-red-800";
    }
    return "bg-white";
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-gray-800">Live Market Data</h1>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 md:mb-6">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 w-full max-w-screen-lg">
        {Object.keys(marketData).map(symbol => (
          <div key={symbol} className="p-4 rounded-lg shadow-md bg-white">
            <h2 className="text-lg md:text-xl font-semibold mb-2 text-gray-700">{symbol}</h2>
            <div className="p-2">
              <p className={`text-sm md:text-base p-2 rounded-lg ${getBidTextColor(marketData[symbol].bidChanged)}`}>
                <span className="font-medium">Bid:</span> {marketData[symbol].bid || "N/A"}
              </p>
              <p className="text-sm md:text-base"><span className="font-medium">High:</span> {marketData[symbol].high || "N/A"}</p>
              <p className="text-sm md:text-base"><span className="font-medium">Low:</span> {marketData[symbol].low || "N/A"}</p>
              <p className="text-sm md:text-base"><span className="font-medium">Status:</span> {marketData[symbol].marketStatus || "N/A"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
