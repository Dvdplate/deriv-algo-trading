import { useEffect, useState, useCallback, useRef } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const socketRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  const connect = useCallback(() => {
    // Clean up any existing socket before creating a new one
    if (socketRef.current) {
      intentionalCloseRef.current = true;
      socketRef.current.close();
      socketRef.current = null;
    }

    setConnectionError(false);
    intentionalCloseRef.current = false;

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionError(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (!intentionalCloseRef.current) {
        setConnectionError(true);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []); // No dependencies — stable reference

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
    setConnectionError(false);
  }, []); // No dependencies — stable reference

  const sendMessage = useCallback((msgObj) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msgObj));
    }
  }, []); // Uses ref, not state — stable reference

  // Connect once on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isConnected, connectionError, lastMessage, sendMessage, reconnect: connect };
};
