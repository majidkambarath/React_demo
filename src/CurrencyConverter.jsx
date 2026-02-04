import { useState, useEffect, useCallback, useMemo, useReducer, memo } from 'react';
import { io } from 'socket.io-client';

// Component for displaying currency rates
const CurrencyRateDisplay = memo(({ label, rate, high, low }) => {
  // Format with 2 decimal places
  const formatNumber = (num) => {
    return num ? parseFloat(num).toFixed(2) : '0.00';
  };

  return (
    <div className="text-sm font-medium text-gray-700">
      <p>{label}: {formatNumber(rate)}</p>
      {high && (
        <p className="text-xs text-gray-500">
          H: {formatNumber(high)} • L: {formatNumber(low)}
        </p>
      )}
    </div>
  );
});

// Component for historical data
const HistoricalData = memo(({ currencyData }) => {
  // Format with 2 decimal places
  const formatNumber = (num) => {
    return num ? parseFloat(num).toFixed(2) : '0.00';
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-gray-700 font-medium mb-2">Historical Data (Today)</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-600">AED to INR</h4>
          {currencyData.aed_to_inr?.today_high ? (
            <>
              <p className="text-sm">High: {formatNumber(currencyData.aed_to_inr.today_high)}</p>
              <p className="text-sm">Low: {formatNumber(currencyData.aed_to_inr.today_low)}</p>
              <p className="text-sm text-gray-500">Date: {currencyData.aed_to_inr.today}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-600">USD to INR</h4>
          {currencyData.usd_to_inr?.today_high ? (
            <>
              <p className="text-sm">High: {formatNumber(currencyData.usd_to_inr.today_high)}</p>
              <p className="text-sm">Low: {formatNumber(currencyData.usd_to_inr.today_low)}</p>
              <p className="text-sm text-gray-500">Date: {currencyData.usd_to_inr.today}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
});

// Status indicator component
const ConnectionStatus = memo(({ connected, socketStatus, lastUpdated, nextUpdate }) => {
  return (
    <div className="flex items-center mb-4">
      <div className={`h-2 w-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
      <span className="text-sm text-gray-500">
        {socketStatus}
        {connected && lastUpdated && (
          <>
            <span> • Last update: {lastUpdated.toLocaleTimeString()}</span>
            {nextUpdate && (
              <span> • Next update: {nextUpdate.toLocaleTimeString()}</span>
            )}
          </>
        )}
      </span>
    </div>
  );
});

// Initial state for our reducer
const initialState = {
  currencyData: {
    aed_to_inr: {
      currency: "AED to INR",
      current_rate: 0,
      today_high: 0,
      today_low: 0,
      today: "-"
    },
    usd_to_inr: {
      currency: "USD to INR",
      current_rate: 0,
      today_high: 0,
      today_low: 0,
      today: "-"
    }
  },
  amount: 1,
  activeCurrency: 'aed',
  connected: false,
  lastUpdated: null,
  nextUpdate: null,
  updateInterval: 60, // default 60 seconds
  socketStatus: 'Connecting...',
  errorMessage: '',
  retryCount: 0
};

// Action types
const ACTION_TYPES = {
  SET_CURRENCY_DATA: 'SET_CURRENCY_DATA',
  SET_AMOUNT: 'SET_AMOUNT',
  TOGGLE_CURRENCY: 'TOGGLE_CURRENCY',
  SET_CONNECTION_STATUS: 'SET_CONNECTION_STATUS',
  SET_ERROR: 'SET_ERROR',
  SET_LAST_UPDATED: 'SET_LAST_UPDATED',
  SET_NEXT_UPDATE: 'SET_NEXT_UPDATE',
  INCREMENT_RETRY: 'INCREMENT_RETRY',
  RESET_RETRY: 'RESET_RETRY'
};

// Reducer function for complex state management
function currencyReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_CURRENCY_DATA:
      return { ...state, currencyData: action.payload };
    case ACTION_TYPES.SET_AMOUNT:
      return { ...state, amount: action.payload };
    case ACTION_TYPES.TOGGLE_CURRENCY:
      return { ...state, activeCurrency: state.activeCurrency === 'aed' ? 'usd' : 'aed' };
    case ACTION_TYPES.SET_CONNECTION_STATUS:
      return { 
        ...state, 
        connected: action.payload.connected,
        socketStatus: action.payload.status,
        errorMessage: action.payload.error || '',
        retryCount: action.payload.resetRetry ? 0 : state.retryCount,
        updateInterval: action.payload.updateInterval || state.updateInterval
      };
    case ACTION_TYPES.INCREMENT_RETRY:
      return { ...state, retryCount: state.retryCount + 1 };
    case ACTION_TYPES.RESET_RETRY:
      return { ...state, retryCount: 0 };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, errorMessage: action.payload };
    case ACTION_TYPES.SET_LAST_UPDATED:
      return { ...state, lastUpdated: action.payload };
    case ACTION_TYPES.SET_NEXT_UPDATE:
      return { ...state, nextUpdate: action.payload };
    default:
      return state;
  }
}

export default function CurrencyConverter() {
  const [state, dispatch] = useReducer(currencyReducer, initialState);
  const { 
    currencyData, 
    amount, 
    activeCurrency, 
    connected, 
    lastUpdated,
    nextUpdate, 
    updateInterval,
    socketStatus, 
    errorMessage, 
    retryCount 
  } = state;

  // Format with 2 decimal places - memoized utility function
  const formatNumber = useCallback((num) => {
    return num ? parseFloat(num).toFixed(2) : '0.00';
  }, []);

  // Calculate converted amount - memoized calculation
  const calculatedAmount = useMemo(() => {
    const rate = activeCurrency === 'aed' 
      ? (currencyData.aed_to_inr?.current_rate || 0) 
      : (currencyData.usd_to_inr?.current_rate || 0);
    return amount * rate;
  }, [amount, activeCurrency, currencyData.aed_to_inr?.current_rate, currencyData.usd_to_inr?.current_rate]);

  // Debounce amount changes
  const [debouncedAmount, setDebouncedAmount] = useState(amount);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount);
    }, 500);
    
    return () => {
      clearTimeout(timer);
    };
  }, [amount]);

  // Handle amount change with debounce preparation
  const handleAmountChange = useCallback((e) => {
    const value = e.target.value;
    if (value === '' || !isNaN(value)) {
      dispatch({ type: ACTION_TYPES.SET_AMOUNT, payload: value === '' ? '' : parseFloat(value) });
    }
  }, []);

  // Toggle currency - memoized callback
  const toggleCurrency = useCallback(() => {
    dispatch({ type: ACTION_TYPES.TOGGLE_CURRENCY });
  }, []);

  // Handle currency updates from socket - memoized callback
  const handleCurrencyUpdate = useCallback((data) => {
    try {
      if (data.aed_to_inr && data.usd_to_inr) {
        // Process combined update
        dispatch({ type: ACTION_TYPES.SET_CURRENCY_DATA, payload: {
          aed_to_inr: data.aed_to_inr,
          usd_to_inr: data.usd_to_inr
        }});
        
        // Update timestamps
        dispatch({ type: ACTION_TYPES.SET_LAST_UPDATED, payload: new Date() });
        
        // Calculate next update time
        const nextUpdateTime = new Date();
        nextUpdateTime.setSeconds(nextUpdateTime.getSeconds() + updateInterval);
        dispatch({ type: ACTION_TYPES.SET_NEXT_UPDATE, payload: nextUpdateTime });
        
        dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });
      }
    } catch (err) {
      console.error('Error processing currency update:', err);
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: `Error processing data: ${err.message}` });
    }
  }, [updateInterval]);

  // Handle form submission
  const handleConvert = useCallback((e) => {
    e.preventDefault();
    // Calculation happens automatically
  }, []);

  // Socket connection management
  useEffect(() => {
    let socket;
    let reconnectTimer;
    
    const connectSocket = () => {
      dispatch({ 
        type: ACTION_TYPES.SET_CONNECTION_STATUS, 
        payload: { 
          connected: false, 
          status: 'Connecting...', 
          error: '' 
        } 
      });
      
      // Connect to the Flask server - update URL as needed
      socket = io('http://localhost:5000', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 10000
      });
      
      socket.on('connect', () => {
        dispatch({ 
          type: ACTION_TYPES.SET_CONNECTION_STATUS, 
          payload: { 
            connected: true, 
            status: 'Connected', 
            error: '', 
            resetRetry: true 
          } 
        });
      });
      
      socket.on('welcome_message', (data) => {
        console.log('Connected to currency service:', data);
      });
      
      socket.on('currency_update', handleCurrencyUpdate);
      
      socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        dispatch({ 
          type: ACTION_TYPES.SET_CONNECTION_STATUS, 
          payload: { 
            connected: false, 
            status: `Connection error`, 
            error: retryCount < 5 
              ? `Connection error. Retrying... (${retryCount + 1}/5)` 
              : 'Failed to connect after multiple attempts. Please check if the server is running.'
          } 
        });
        
        if (retryCount < 5) {
          dispatch({ type: ACTION_TYPES.INCREMENT_RETRY });
        }
      });
      
      socket.on('disconnect', (reason) => {
        dispatch({ 
          type: ACTION_TYPES.SET_CONNECTION_STATUS, 
          payload: { 
            connected: false, 
            status: `Disconnected`, 
            error: reason === 'io server disconnect' 
              ? 'Disconnected by the server. Please refresh the page.' 
              : 'Connection lost. Attempting to reconnect...'
          } 
        });
      });
    };
    
    connectSocket();
    
    // Setup reconnection logic
    reconnectTimer = setInterval(() => {
      if (!connected && retryCount >= 5) {
        console.log('Attempting manual reconnection...');
        dispatch({ type: ACTION_TYPES.RESET_RETRY });
        
        if (socket) {
          socket.disconnect();
        }
        
        connectSocket();
      }
    }, 30000); // Try every 30 seconds after initial attempts fail
    
    // Countdown timer for next update
    const updateCountdown = setInterval(() => {
      if (connected && nextUpdate) {
        const now = new Date();
        if (now >= nextUpdate) {
          // Time for next update has passed, we'll wait for server push
          return;
        }
      }
    }, 1000);
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
      clearInterval(reconnectTimer);
      clearInterval(updateCountdown);
    };
  }, [connected, retryCount, handleCurrencyUpdate, nextUpdate]);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
        <div className="p-8 w-full">
          <div className="uppercase tracking-wide text-sm text-indigo-500 font-semibold mb-1">
            Live Currency Converter
          </div>
          
          <ConnectionStatus 
            connected={connected} 
            socketStatus={socketStatus} 
            lastUpdated={lastUpdated}
            nextUpdate={nextUpdate}
          />
          
          {errorMessage && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
              {errorMessage}
            </div>
          )}
          
          <div className="flex justify-between mb-6">
            <CurrencyRateDisplay 
              label="AED → INR"
              rate={currencyData.aed_to_inr?.current_rate}
              high={currencyData.aed_to_inr?.today_high}
              low={currencyData.aed_to_inr?.today_low}
            />
            <CurrencyRateDisplay 
              label="USD → INR"
              rate={currencyData.usd_to_inr?.current_rate}
              high={currencyData.usd_to_inr?.today_high}
              low={currencyData.usd_to_inr?.today_low}
            />
          </div>
          
          <form onSubmit={handleConvert} className="mb-6">
            <div className="flex mb-4">
              <div className="w-1/2 pr-2">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  From
                </label>
                <div className="flex">
                  <input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    className="shadow appearance-none border rounded-l w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  />
                  <button
                    type="button"
                    onClick={toggleCurrency}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r"
                  >
                    {activeCurrency.toUpperCase()}
                  </button>
                </div>
              </div>
              <div className="w-1/2 pl-2">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  To (INR)
                </label>
                <input
                  type="text"
                  value={isNaN(calculatedAmount) ? '0.00' : formatNumber(calculatedAmount)}
                  readOnly
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-gray-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
            >
              Convert
            </button>
          </form>
          
          {lastUpdated && <HistoricalData currencyData={currencyData} />}
        </div>
      </div>
    </div>
  );
}