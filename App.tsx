import React, { useState, useEffect, useRef } from 'react';
import { Users, Cpu, RefreshCw, ArrowRight, ShieldCheck, Globe, Wifi, Copy, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Peer, { DataConnection } from 'peerjs';
import { Move, GameMode, GameState, Score, Player, NetworkMessage } from './types';
import { getGameCommentary } from './services/gemini';
import { Button } from './components/Button';
import { MoveIcon } from './components/MoveIcon';
import { Input } from './components/Input';

const MOVES = [Move.ROCK, Move.PAPER, Move.SCISSORS];

const App: React.FC = () => {
  // --- State ---
  
  // Setup
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState("Player 2");
  const [error, setError] = useState("");
  
  // Game Configuration
  const [mode, setMode] = useState<GameMode | null>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
  const [score, setScore] = useState<Score>({ p1: 0, p2: 0 });
  
  // Networking
  const [peerId, setPeerId] = useState<string>("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [isHost, setIsHost] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Moves & Results
  const [p1Move, setP1Move] = useState<Move | null>(null); // My move
  const [p2Move, setP2Move] = useState<Move | null>(null); // Opponent move
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [commentary, setCommentary] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);

  // Online Sync State
  const [isMyReady, setIsMyReady] = useState(false);
  const [isOpponentReady, setIsOpponentReady] = useState(false);

  // --- Logic ---

  // Initialize Peer
  const initializePeer = () => {
    if (peerRef.current) return;
    
    const newPeer = new Peer();
    
    newPeer.on('open', (id) => {
      setPeerId(id);
      setError("");
    });

    newPeer.on('connection', (conn) => {
      // Incoming connection (I am Host)
      handleConnection(conn);
    });

    newPeer.on('error', (err) => {
      console.error("Peer Error:", err);
      setError("Connection failed. Please check the Room ID and try again.");
      setConnectionStatus('disconnected');
      setIsHost(false);
    });

    peerRef.current = newPeer;
  };

  // Handle Connection (Both Host and Joiner use this)
  const handleConnection = (conn: DataConnection) => {
    connRef.current = conn;
    setConnectionStatus('connecting');

    conn.on('open', () => {
      setConnectionStatus('connected');
      setError("");
      // Send my name to peer immediately upon opening
      conn.send({ type: 'HANDSHAKE', name: playerName });
    });

    conn.on('data', (data: any) => {
      const msg = data as NetworkMessage;
      handleNetworkMessage(msg);
    });
    
    conn.on('close', () => {
      setError("Opponent disconnected");
      setConnectionStatus('disconnected');
      setTimeout(resetGame, 3000);
    });
    
    conn.on('error', () => {
       setError("Connection lost.");
       setConnectionStatus('disconnected');
    });
  };

  // Connect to a Room (I am Joiner)
  const joinRoom = () => {
    if (!roomIdInput.trim() || !peerRef.current) return;
    setError("");
    const conn = peerRef.current.connect(roomIdInput.trim());
    handleConnection(conn);
    setIsHost(false);
  };

  // Create a Room (I am Host)
  const createRoom = () => {
    initializePeer();
    setIsHost(true);
    setError("");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  // Handle Network Messages
  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'HANDSHAKE':
        setOpponentName(msg.name);
        // Both sides transition to match when they receive the opponent's name
        setGameState(GameState.ONLINE_MATCH);
        break;
      case 'MOVE':
        setP2Move(msg.move);
        break;
      case 'PLAY_AGAIN':
        setIsOpponentReady(true);
        break;
    }
  };

  // Determine Winner
  const determineWinner = (m1: Move, m2: Move): Player | 'Draw' => {
    if (m1 === m2) return 'Draw';
    
    const isP1Win = 
      (m1 === Move.ROCK && m2 === Move.SCISSORS) ||
      (m1 === Move.PAPER && m2 === Move.ROCK) ||
      (m1 === Move.SCISSORS && m2 === Move.PAPER);
    
    if (isP1Win) return playerName;
    
    return mode === GameMode.VS_CPU ? 'Gemini AI' : opponentName;
  };

  // Handle Move Selection
  const handleMove = (move: Move) => {
    if (mode === GameMode.ONLINE) {
      if (p1Move) return; // Already moved
      setP1Move(move);
      // Send move to opponent
      connRef.current?.send({ type: 'MOVE', move });
    } else {
      // Local Logic
      if (gameState === GameState.P1_TURN) {
        setP1Move(move);
        if (mode === GameMode.VS_CPU) {
          const randomMove = MOVES[Math.floor(Math.random() * MOVES.length)];
          setP2Move(randomMove);
          setGameState(GameState.RESULT);
        } else {
          setGameState(GameState.TRANSITION);
        }
      } else if (gameState === GameState.P2_TURN) {
        setP2Move(move);
        setGameState(GameState.RESULT);
      }
    }
  };

  // Effect: Calculate Result
  useEffect(() => {
    const bothMoved = p1Move && p2Move;
    
    if (bothMoved && (gameState === GameState.ONLINE_MATCH || gameState === GameState.RESULT || gameState === GameState.P2_TURN)) {
        if (gameState !== GameState.RESULT) setGameState(GameState.RESULT);

        const result = determineWinner(p1Move, p2Move);
        setWinner(result);
        
        // Update score
        if (result === playerName || result === 'Player 1') {
            setScore(s => ({ ...s, p1: s.p1 + 1 }));
        } else if (result !== 'Draw') {
            setScore(s => ({ ...s, p2: s.p2 + 1 }));
        }

        // Commentary
        setIsThinking(true);
        setCommentary("");
        const p2NameForAi = mode === GameMode.VS_CPU ? 'Gemini' : opponentName;
        getGameCommentary(p1Move, p2Move, result, mode === GameMode.VS_CPU ? 'VS_CPU' : 'VS_FRIEND')
            .then(setCommentary)
            .finally(() => setIsThinking(false));
    }
  }, [p1Move, p2Move, gameState]);

  // Effect: Sync New Round (Online)
  useEffect(() => {
    if (mode === GameMode.ONLINE && isMyReady && isOpponentReady) {
      // Both players are ready, reset and start
      setP1Move(null);
      setP2Move(null);
      setWinner(null);
      setCommentary("");
      setIsMyReady(false);
      setIsOpponentReady(false);
      setGameState(GameState.ONLINE_MATCH);
    }
  }, [mode, isMyReady, isOpponentReady]);

  // Actions
  const handleStartSetup = () => {
    if (playerName.trim()) {
      setGameState(GameState.MENU);
      initializePeer(); 
    }
  };

  const nextRound = () => {
    if (mode === GameMode.ONLINE) {
      setIsMyReady(true);
      connRef.current?.send({ type: 'PLAY_AGAIN' });
    } else {
      setP1Move(null);
      setP2Move(null);
      setWinner(null);
      setCommentary("");
      setGameState(GameState.P1_TURN);
    }
  };

  const resetGame = () => {
    if (connRef.current) {
        connRef.current.close();
        connRef.current = null;
    }
    setConnectionStatus('disconnected');
    setScore({ p1: 0, p2: 0 });
    setMode(null);
    setGameState(GameState.MENU);
    setP1Move(null);
    setP2Move(null);
    setWinner(null);
    setCommentary("");
    setIsMyReady(false);
    setIsOpponentReady(false);
    setOpponentName("Player 2");
    setError("");
  };

  // --- Renders ---

  const renderSetup = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto px-4 w-full animate-float">
      <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 mb-8">
        RPS Arena
      </h1>
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 w-full shadow-2xl">
        <h2 className="text-xl font-bold mb-4">Enter your name</h2>
        <Input 
          placeholder="e.g. Maverick" 
          value={playerName} 
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStartSetup()}
          autoFocus
        />
        <Button 
            className="mt-6" 
            fullWidth 
            onClick={handleStartSetup}
            disabled={!playerName.trim()}
        >
          Enter Arena <ArrowRight size={18} className="inline ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Welcome, {playerName}</h1>
        <p className="text-slate-400">Choose your battleground</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl px-4">
        {/* VS AI */}
        <button 
          onClick={() => { setMode(GameMode.VS_CPU); setGameState(GameState.P1_TURN); setOpponentName("Gemini AI"); }}
          className="group relative p-6 bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-indigo-500 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/20"
        >
          <Cpu className="w-10 h-10 text-indigo-400 mb-4 mx-auto group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white mb-2">Vs Gemini AI</h3>
          <p className="text-sm text-slate-400">Challenge the AI</p>
        </button>

        {/* VS Friend Local */}
        <button 
          onClick={() => { setMode(GameMode.VS_FRIEND); setGameState(GameState.P1_TURN); setOpponentName("Player 2"); }}
          className="group relative p-6 bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-pink-500 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/20"
        >
          <Users className="w-10 h-10 text-pink-400 mb-4 mx-auto group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white mb-2">Local Friend</h3>
          <p className="text-sm text-slate-400">Pass & Play</p>
        </button>
        
        {/* Online */}
        <button 
          onClick={() => { setMode(GameMode.ONLINE); setGameState(GameState.LOBBY); }}
          className="group relative p-6 bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-cyan-500 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/20"
        >
          <Globe className="w-10 h-10 text-cyan-400 mb-4 mx-auto group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white mb-2">Online</h3>
          <p className="text-sm text-slate-400">Play remotely</p>
        </button>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] max-w-lg mx-auto w-full px-4 animate-in fade-in">
        <h2 className="text-3xl font-bold mb-8">Online Lobby</h2>
        
        {error && (
            <div className="mb-6 w-full bg-rose-500/10 border border-rose-500/50 p-4 rounded-xl flex items-center gap-3 text-rose-300">
                <AlertCircle size={24} />
                <span className="font-medium">{error}</span>
            </div>
        )}

        {isHost ? (
            <div className="w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-6">
                <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto" />
                <div>
                    <p className="text-slate-400 mb-2">Share this Room Code with your friend</p>
                    <div className="flex items-center justify-center gap-2 bg-slate-900 p-4 rounded-xl border border-slate-700 group cursor-pointer hover:border-cyan-500 transition-colors"
                         onClick={() => {
                             navigator.clipboard.writeText(peerId);
                             alert("Copied to clipboard!");
                         }}
                    >
                        <span className="text-2xl font-mono font-bold text-cyan-300 tracking-wider">{peerId || "Generating..."}</span>
                        <Copy size={16} className="text-slate-500 group-hover:text-white" />
                    </div>
                </div>
                <p className="text-sm text-slate-500 animate-pulse">Waiting for opponent to join...</p>
                <Button variant="secondary" onClick={() => setIsHost(false)}>Cancel</Button>
            </div>
        ) : (
            <div className="w-full space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={createRoom}
                        className="p-6 bg-slate-800 rounded-xl border-2 border-slate-700 hover:border-cyan-500 transition-all text-center group"
                    >
                        <Wifi className="w-8 h-8 text-cyan-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <span className="block font-bold">Create Room</span>
                    </button>
                    <div className="p-6 bg-slate-800 rounded-xl border-2 border-slate-700 text-center opacity-50 cursor-not-allowed">
                        <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <span className="block font-bold">Join Room</span>
                    </div>
                </div>
                
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-slate-900 text-slate-500 uppercase font-bold tracking-wider">or join existing</span>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
                     <Input 
                        placeholder="Paste Room Code here" 
                        value={roomIdInput}
                        onChange={(e) => setRoomIdInput(e.target.value)}
                        label="Room Code"
                     />
                     <Button 
                        fullWidth 
                        onClick={joinRoom} 
                        disabled={!roomIdInput || connectionStatus === 'connecting'}
                        className="bg-cyan-600 hover:bg-cyan-500"
                     >
                        {connectionStatus === 'connecting' ? (
                            <><Loader2 className="animate-spin inline mr-2" /> Connecting...</>
                        ) : 'Join Game'}
                     </Button>
                </div>
                
                <Button variant="ghost" fullWidth onClick={() => setGameState(GameState.MENU)}>Back to Menu</Button>
            </div>
        )}
    </div>
  );

  const renderGameArea = () => {
    const isOnline = mode === GameMode.ONLINE;
    
    // Waiting for opponent in Online mode after I moved
    if (isOnline && p1Move && !p2Move) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-8 animate-pulse">
                <div className="p-8 bg-slate-800 rounded-full border border-cyan-500/30">
                    <Loader2 size={64} className="text-cyan-400 animate-spin" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">Waiting for {opponentName}...</h2>
                    <p className="text-slate-400">You threw <span className="text-white font-bold">{p1Move}</span></p>
                </div>
            </div>
        );
    }
    
    // Standard Game Controls
    return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 relative">
            {/* Opponent Ready Indicator */}
            {isOnline && !p1Move && p2Move && (
                 <div className="absolute top-0 right-0 md:right-8 bg-pink-600 text-white px-4 py-2 rounded-full animate-bounce shadow-lg flex items-center gap-2">
                    <CheckCircle2 size={16} /> {opponentName} is ready!
                 </div>
            )}

            <div className="text-center space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-sm font-medium border border-slate-700">
                Round {score.p1 + score.p2 + 1}
              </span>
              <h2 className="text-4xl font-bold text-white">
                {isOnline ? "Your Turn" : (gameState === GameState.P1_TURN ? `${playerName}'s Turn` : `${opponentName}'s Turn`)}
              </h2>
              <p className="text-slate-400">Choose your weapon</p>
            </div>
            
            <div className="grid grid-cols-3 gap-4 w-full max-w-xl mx-auto mt-8">
              {MOVES.map((m) => (
                <button
                  key={m}
                  onClick={() => handleMove(m)}
                  className="group flex flex-col items-center justify-center p-6 bg-slate-800 rounded-xl hover:bg-slate-700 active:bg-indigo-600 transition-all border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
                >
                  <MoveIcon move={m} size={48} className="text-white mb-2 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-slate-300 group-hover:text-white">{m}</span>
                </button>
              ))}
            </div>
        </div>
    );
  };

  const renderResult = () => (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
      
      {/* Moves Display */}
      <div className="flex items-center justify-center gap-8 md:gap-16 mb-12 w-full">
        {/* P1 Move */}
        <div className={`flex flex-col items-center transform transition-all duration-500 ${winner === playerName || winner === 'Player 1' ? 'scale-110' : 'opacity-75 scale-90'}`}>
          <div className={`p-8 rounded-full mb-4 ${winner === playerName || winner === 'Player 1' ? 'bg-indigo-500 shadow-xl shadow-indigo-500/50' : 'bg-slate-700'}`}>
            <MoveIcon move={p1Move!} size={64} className="text-white" animate={true} />
          </div>
          <span className="font-bold text-xl text-indigo-300">{playerName}</span>
        </div>

        <div className="text-4xl font-black text-slate-600">VS</div>

        {/* P2/AI Move */}
        <div className={`flex flex-col items-center transform transition-all duration-500 ${winner !== playerName && winner !== 'Player 1' && winner !== 'Draw' ? 'scale-110' : 'opacity-75 scale-90'}`}>
          <div className={`p-8 rounded-full mb-4 ${winner !== playerName && winner !== 'Player 1' && winner !== 'Draw' ? 'bg-pink-500 shadow-xl shadow-pink-500/50' : 'bg-slate-700'}`}>
            <MoveIcon move={p2Move!} size={64} className="text-white" animate={true} />
          </div>
          <span className="font-bold text-xl text-pink-300">
            {opponentName}
          </span>
        </div>
      </div>

      {/* Result Text */}
      <div className="text-center space-y-4 mb-8">
        <h2 className="text-5xl font-black text-white tracking-tight">
          {winner === 'Draw' ? 'DRAW!' : `${winner?.toUpperCase()} WINS!`}
        </h2>
        
        {/* AI Commentary Bubble */}
        <div className="min-h-[80px] flex items-center justify-center">
          {isThinking ? (
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-sm">Gemini is commenting...</span>
            </div>
          ) : (
            commentary && (
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 px-6 py-4 rounded-xl max-w-xl mx-auto shadow-lg relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Commentary
                </div>
                <p className="text-lg text-indigo-200 italic">"{commentary}"</p>
              </div>
            )
          )}
        </div>
      </div>

      <div className="flex gap-4 items-center">
        {mode === GameMode.ONLINE && isMyReady ? (
            <div className="px-6 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center gap-2 animate-pulse">
                <Loader2 className="animate-spin" size={18} />
                Waiting for {opponentName}...
            </div>
        ) : (
            <Button onClick={nextRound} className="min-w-[160px]">
              Play Again
            </Button>
        )}
        
        <Button variant="secondary" onClick={resetGame}>
          {mode === GameMode.ONLINE ? 'Disconnect' : 'Back to Menu'}
        </Button>
      </div>
    </div>
  );

  const renderTransition = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-8 py-12">
      <div className="p-8 bg-slate-800 rounded-full">
        <ShieldCheck size={64} className="text-emerald-400" />
      </div>
      <h2 className="text-3xl font-bold text-center">
        Pass device to {opponentName}
      </h2>
      <p className="text-slate-400 max-w-md text-center">
        {playerName} has made their move. Hand the device over to {opponentName} to continue.
      </p>
      <Button onClick={() => setGameState(GameState.P2_TURN)} className="bg-emerald-600 hover:bg-emerald-500">
        I am {opponentName} - Ready!
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header / Scoreboard */}
      {gameState !== GameState.MENU && gameState !== GameState.SETUP && (
        <header className="bg-slate-800/50 border-b border-slate-700/50 p-4">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <button onClick={resetGame} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
              <span className="font-bold text-lg tracking-tight">RPS Arena</span>
            </button>
            
            <div className="flex items-center gap-8 bg-slate-900/50 px-6 py-2 rounded-full border border-slate-700">
              <div className="text-center">
                <span className="block text-xs text-indigo-400 font-bold uppercase truncate max-w-[80px]">{playerName}</span>
                <span className="text-2xl font-black text-white">{score.p1}</span>
              </div>
              <div className="h-8 w-px bg-slate-700"></div>
              <div className="text-center">
                <span className="block text-xs text-pink-400 font-bold uppercase truncate max-w-[80px]">{opponentName}</span>
                <span className="text-2xl font-black text-white">{score.p2}</span>
              </div>
            </div>
            
            <button onClick={resetGame} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-all">
              <RefreshCw size={20} />
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden relative">
        {gameState === GameState.SETUP && renderSetup()}
        {gameState === GameState.MENU && renderMenu()}
        {gameState === GameState.LOBBY && renderLobby()}
        
        {(gameState === GameState.P1_TURN || gameState === GameState.P2_TURN || gameState === GameState.ONLINE_MATCH) && renderGameArea()}
        
        {gameState === GameState.TRANSITION && renderTransition()}
        {gameState === GameState.RESULT && renderResult()}
      </main>
      
      {/* Footer */}
      <footer className="p-4 text-center text-slate-600 text-sm">
        Powered by Google Gemini • Built with React & Tailwind
      </footer>
    </div>
  );
};

export default App;