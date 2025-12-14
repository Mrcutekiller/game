import React, { useState, useEffect, useRef } from 'react';
import { Users, Cpu, RefreshCw, ArrowRight, ShieldCheck, Globe, Wifi, Copy, Loader2, AlertCircle, CheckCircle2, Trophy, Sparkles } from 'lucide-react';
import Peer, { DataConnection } from 'peerjs';
import { Move, GameMode, GameState, Score, Player, NetworkMessage } from './types';
import { getGameCommentary } from './services/gemini';
import { Button } from './components/Button';
import { MoveIcon } from './components/MoveIcon';
import { Input } from './components/Input';

const MOVES = [Move.ROCK, Move.PAPER, Move.SCISSORS];

const AI_PERSONAS = [
  'Nova', 'Apex', 'Synapse', 'Vortex', 'Echo', 'Nebula', 
  'Cipher', 'Zenith', 'Gemini Prime', 'Quantum', 'Flux'
];

// Simple particle system for wins
const Confetti: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            opacity: 0.6
          }}
        />
      ))}
    </div>
  );
};

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
    
    // Using default PeerJS cloud server
    const newPeer = new Peer();
    
    newPeer.on('open', (id) => {
      setPeerId(id);
      setError("");
    });

    newPeer.on('connection', (conn) => {
      handleConnection(conn);
    });

    newPeer.on('error', (err) => {
      console.error("Peer Error:", err);
      // Friendly error mapping
      if (err.type === 'peer-unavailable') {
         setError("Room not found. Please check the code.");
      } else {
         setError("Connection error. Please try again.");
      }
      setConnectionStatus('disconnected');
      setIsHost(false);
    });

    peerRef.current = newPeer;
  };

  const handleConnection = (conn: DataConnection) => {
    connRef.current = conn;
    setConnectionStatus('connecting');

    conn.on('open', () => {
      setConnectionStatus('connected');
      setError("");
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
  };

  const joinRoom = () => {
    if (!roomIdInput.trim() || !peerRef.current) return;
    setError("");
    setConnectionStatus('connecting');
    const conn = peerRef.current.connect(roomIdInput.trim());
    handleConnection(conn);
    setIsHost(false);
  };

  const createRoom = () => {
    initializePeer();
    setIsHost(true);
    setError("");
  };

  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'HANDSHAKE':
        setOpponentName(msg.name);
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

  const determineWinner = (m1: Move, m2: Move): Player | 'Draw' => {
    if (m1 === m2) return 'Draw';
    const isP1Win = 
      (m1 === Move.ROCK && m2 === Move.SCISSORS) ||
      (m1 === Move.PAPER && m2 === Move.ROCK) ||
      (m1 === Move.SCISSORS && m2 === Move.PAPER);
    
    if (isP1Win) return playerName;
    // Return the dynamic opponent name (whether AI persona or player name)
    return opponentName;
  };

  const handleMove = (move: Move) => {
    if (mode === GameMode.ONLINE) {
      if (p1Move) return; 
      setP1Move(move);
      connRef.current?.send({ type: 'MOVE', move });
    } else {
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

  useEffect(() => {
    const bothMoved = p1Move && p2Move;
    if (bothMoved && (gameState === GameState.ONLINE_MATCH || gameState === GameState.RESULT || gameState === GameState.P2_TURN)) {
        if (gameState !== GameState.RESULT) setGameState(GameState.RESULT);
        const result = determineWinner(p1Move, p2Move);
        setWinner(result);
        
        if (result === playerName || result === 'Player 1') {
            setScore(s => ({ ...s, p1: s.p1 + 1 }));
        } else if (result !== 'Draw') {
            setScore(s => ({ ...s, p2: s.p2 + 1 }));
        }

        setIsThinking(true);
        setCommentary("");
        getGameCommentary(p1Move, p2Move, result, mode === GameMode.VS_CPU ? 'VS_CPU' : 'VS_FRIEND')
            .then(setCommentary)
            .finally(() => setIsThinking(false));
    }
  }, [p1Move, p2Move, gameState]);

  useEffect(() => {
    if (mode === GameMode.ONLINE && isMyReady && isOpponentReady) {
      setP1Move(null);
      setP2Move(null);
      setWinner(null);
      setCommentary("");
      setIsMyReady(false);
      setIsOpponentReady(false);
      setGameState(GameState.ONLINE_MATCH);
    }
  }, [mode, isMyReady, isOpponentReady]);

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
    <div className="flex flex-col items-center justify-center min-h-[70vh] max-w-md mx-auto px-4 w-full animate-in fade-in zoom-in duration-500">
      <div className="mb-12 relative">
         <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-full animate-pulse"></div>
         <h1 className="relative text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-200 to-indigo-400 tracking-tighter">
           RPS
         </h1>
         <div className="absolute -right-8 -top-4 rotate-12">
            <span className="px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full text-xs font-bold text-white shadow-lg shadow-pink-500/30">
                ARENA
            </span>
         </div>
      </div>

      <div className="glass-panel p-8 rounded-3xl w-full shadow-2xl backdrop-blur-xl border-t border-white/10">
        <h2 className="text-lg font-medium text-slate-300 mb-6 text-center">Initialize Player Identity</h2>
        <Input 
          placeholder="Enter Codename" 
          value={playerName} 
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStartSetup()}
          autoFocus
          className="text-center text-lg tracking-wide bg-slate-900/50 focus:bg-slate-900 transition-all border-slate-700 focus:border-indigo-500"
        />
        <Button 
            className="mt-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border border-white/10" 
            fullWidth 
            onClick={handleStartSetup}
            disabled={!playerName.trim()}
        >
          Enter The Arena
        </Button>
      </div>
    </div>
  );

  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-white tracking-tight">Welcome, <span className="text-indigo-400">{playerName}</span></h1>
        <p className="text-slate-400 font-light">Select your combat protocol</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4">
        {[
          { 
            id: GameMode.VS_CPU, 
            label: 'Vs Gemini AI', 
            desc: 'Advanced Neural Opponent', 
            icon: Cpu, 
            color: 'text-indigo-400', 
            border: 'hover:border-indigo-500', 
            glow: 'hover:shadow-indigo-500/20' 
          },
          { 
            id: GameMode.VS_FRIEND, 
            label: 'Local Friend', 
            desc: 'Hotseat Multiplayer', 
            icon: Users, 
            color: 'text-pink-400', 
            border: 'hover:border-pink-500', 
            glow: 'hover:shadow-pink-500/20' 
          },
          { 
            id: GameMode.ONLINE, 
            label: 'Online Duel', 
            desc: 'Remote Connection', 
            icon: Globe, 
            color: 'text-cyan-400', 
            border: 'hover:border-cyan-500', 
            glow: 'hover:shadow-cyan-500/20' 
          }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => {
              setMode(item.id);
              if (item.id === GameMode.ONLINE) {
                setGameState(GameState.LOBBY);
              } else {
                setGameState(GameState.P1_TURN);
                if (item.id === GameMode.VS_CPU) {
                    // Pick a random creative persona for AI
                    const persona = AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)];
                    setOpponentName(persona);
                } else {
                    setOpponentName("Player 2");
                }
              }
            }}
            className={`glass-panel p-8 rounded-3xl border border-transparent transition-all duration-300 hover:scale-105 hover:-translate-y-1 shadow-xl ${item.border} ${item.glow} group text-left`}
          >
            <div className={`p-4 rounded-2xl bg-slate-800/50 w-fit mb-6 group-hover:bg-slate-800 transition-colors`}>
              <item.icon className={`w-8 h-8 ${item.color}`} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{item.label}</h3>
            <p className="text-sm text-slate-400">{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] max-w-lg mx-auto w-full px-4 animate-in fade-in">
        <h2 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">Online Uplink</h2>
        
        {error && (
            <div className="mb-6 w-full glass-panel border-l-4 border-l-rose-500 p-4 rounded-r-xl flex items-center gap-3 text-rose-300">
                <AlertCircle size={24} />
                <span className="font-medium">{error}</span>
            </div>
        )}

        {isHost ? (
            <div className="glass-panel w-full p-8 rounded-3xl text-center space-y-8">
                <div className="relative inline-block">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
                    <Loader2 className="w-16 h-16 text-cyan-400 animate-spin relative z-10" />
                </div>
                <div>
                    <p className="text-slate-400 mb-3 text-sm uppercase tracking-widest font-bold">Room Frequency Code</p>
                    <button 
                         className="w-full flex items-center justify-center gap-4 bg-slate-900/80 hover:bg-slate-900 p-5 rounded-2xl border border-slate-700/50 group transition-all hover:border-cyan-500/50 active:scale-95"
                         onClick={() => {
                             navigator.clipboard.writeText(peerId);
                             // Could add toast here
                         }}
                    >
                        <span className="text-3xl font-mono font-bold text-white tracking-widest">{peerId || "..."}</span>
                        <Copy size={20} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    </button>
                </div>
                <p className="text-sm text-slate-500 animate-pulse">Scanning for incoming connection...</p>
                <Button variant="secondary" onClick={() => setIsHost(false)} fullWidth>Abort Sequence</Button>
            </div>
        ) : (
            <div className="w-full space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={createRoom}
                        className="glass-panel p-6 rounded-2xl hover:bg-slate-800/50 transition-all text-center group border border-transparent hover:border-cyan-500/30"
                    >
                        <Wifi className="w-8 h-8 text-cyan-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                        <span className="block font-bold">Host</span>
                    </button>
                    <div className="glass-panel p-6 rounded-2xl opacity-40 cursor-not-allowed text-center border border-transparent">
                         <Globe className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                         <span className="block font-bold">Public</span>
                    </div>
                </div>
                
                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="px-4 bg-[#0f172a] text-slate-500 uppercase font-bold tracking-widest">or join existing</span>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl space-y-4">
                     <Input 
                        placeholder="Paste Room Code" 
                        value={roomIdInput}
                        onChange={(e) => setRoomIdInput(e.target.value)}
                        className="text-center font-mono tracking-wider text-lg"
                     />
                     <Button 
                        fullWidth 
                        onClick={joinRoom} 
                        disabled={!roomIdInput || connectionStatus === 'connecting'}
                        className="bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20"
                     >
                        {connectionStatus === 'connecting' ? 'Establishing Link...' : 'Connect'}
                     </Button>
                </div>
                
                <Button variant="ghost" fullWidth onClick={() => setGameState(GameState.MENU)}>Return to Base</Button>
            </div>
        )}
    </div>
  );

  const renderGameArea = () => {
    const isOnline = mode === GameMode.ONLINE;
    
    if (isOnline && p1Move && !p2Move) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-pulse">
                <div className="p-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 p-[2px]">
                   <div className="p-8 bg-slate-900 rounded-full">
                      <Loader2 size={48} className="text-white animate-spin" />
                   </div>
                </div>
                <div className="text-center">
                    <h2 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400">Awaiting Response</h2>
                    <p className="text-slate-500">Opponent: <span className="text-white font-medium">{opponentName}</span></p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-12 animate-in fade-in duration-500 relative">
            {isOnline && !p1Move && p2Move && (
                 <div className="absolute top-0 right-0 md:right-4 bg-pink-500/10 border border-pink-500/20 text-pink-200 px-6 py-3 rounded-full animate-bounce shadow-lg flex items-center gap-3 backdrop-blur-md">
                    <CheckCircle2 size={18} className="text-pink-500" /> 
                    <span className="font-bold">{opponentName} is ready!</span>
                 </div>
            )}

            <div className="text-center space-y-4">
              <span className="inline-block px-4 py-1.5 rounded-full bg-slate-800/80 text-slate-400 text-xs font-bold tracking-widest border border-slate-700 uppercase">
                Round {score.p1 + score.p2 + 1}
              </span>
              <h2 className="text-5xl md:text-6xl font-black text-white tracking-tight drop-shadow-lg">
                {isOnline ? "YOUR MOVE" : (gameState === GameState.P1_TURN ? `${playerName.toUpperCase()}` : `${opponentName.toUpperCase()}`)}
              </h2>
            </div>
            
            <div className="grid grid-cols-3 gap-4 md:gap-8 w-full max-w-2xl mx-auto">
              {MOVES.map((m) => (
                <button
                  key={m}
                  onClick={() => handleMove(m)}
                  className="group relative flex flex-col items-center justify-center aspect-square glass-panel rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:bg-slate-800/80 hover:shadow-2xl hover:shadow-indigo-500/20 border-t border-white/5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <MoveIcon move={m} size={56} className="text-slate-300 group-hover:text-white transition-colors relative z-10" />
                  <span className="mt-4 font-bold text-slate-400 group-hover:text-white tracking-widest text-sm relative z-10">{m}</span>
                </button>
              ))}
            </div>
        </div>
    );
  };

  const renderResult = () => (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto animate-in fade-in zoom-in duration-300 relative">
      {/* Background Elements */}
      {winner === playerName && <Confetti />}
      
      <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-8 md:gap-12 w-full mb-12">
        {/* P1 */}
        <div className={`flex flex-col items-center order-2 md:order-1 transition-all duration-700 ${winner === playerName || winner === 'Player 1' ? 'scale-110 drop-shadow-[0_0_35px_rgba(79,70,229,0.5)]' : 'opacity-60 grayscale'}`}>
          <div className="glass-panel p-10 rounded-full mb-6 border-2 border-indigo-500/30 bg-indigo-500/10">
            <MoveIcon move={p1Move!} size={64} className="text-indigo-400" animate={true} />
          </div>
          <span className="font-bold text-2xl text-white tracking-wider">{playerName}</span>
        </div>

        {/* VS Status */}
        <div className="flex flex-col items-center justify-center order-1 md:order-2 space-y-4">
           <h2 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 tracking-tighter italic">
              {winner === 'Draw' ? 'DRAW' : (winner === playerName ? 'VICTORY' : 'DEFEAT')}
           </h2>
        </div>

        {/* P2 - Checks against opponentName which holds the AI persona or player name */}
        <div className={`flex flex-col items-center order-3 transition-all duration-700 ${winner === opponentName || winner === 'Player 2' ? 'scale-110 drop-shadow-[0_0_35px_rgba(236,72,153,0.5)]' : 'opacity-60 grayscale'}`}>
          <div className="glass-panel p-10 rounded-full mb-6 border-2 border-pink-500/30 bg-pink-500/10">
            <MoveIcon move={p2Move!} size={64} className="text-pink-400" animate={true} />
          </div>
          <span className="font-bold text-2xl text-white tracking-wider">{opponentName}</span>
        </div>
      </div>

      {/* Commentary */}
      <div className="w-full max-w-2xl mx-auto mb-12 h-24 flex items-center justify-center">
         {isThinking ? (
            <div className="flex items-center gap-3 px-6 py-3 rounded-full glass-panel">
               <Sparkles size={16} className="text-amber-400 animate-spin" />
               <span className="text-sm text-slate-400 font-medium">Gemini AI is analyzing the match...</span>
            </div>
         ) : (
            commentary && (
              <div className="glass-panel px-8 py-6 rounded-2xl border-l-4 border-l-amber-400 relative animate-in slide-in-from-bottom-4">
                 <p className="text-xl md:text-2xl text-white font-serif italic text-center">"{commentary}"</p>
              </div>
            )
         )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center z-10">
        {mode === GameMode.ONLINE && isMyReady ? (
            <div className="px-8 py-4 rounded-xl glass-panel text-slate-300 flex items-center gap-3 animate-pulse">
                <Loader2 className="animate-spin text-indigo-400" size={20} />
                <span className="font-medium tracking-wide">WAITING FOR OPPONENT...</span>
            </div>
        ) : (
            <Button onClick={nextRound} className="min-w-[200px] bg-white text-slate-900 hover:bg-slate-200 shadow-xl shadow-white/10">
              {mode === GameMode.ONLINE ? 'Ready Next Round' : 'Play Again'}
            </Button>
        )}
        
        <Button variant="ghost" onClick={resetGame} className="text-slate-400 hover:text-white">
          {mode === GameMode.ONLINE ? 'Disconnect' : 'Exit to Menu'}
        </Button>
      </div>
    </div>
  );

  const renderTransition = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-12 py-12">
      <div className="p-10 glass-panel rounded-full border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
        <ShieldCheck size={80} className="text-emerald-400" />
      </div>
      <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-white">SECURE DEVICE</h2>
          <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
            Move registered. Pass terminal to <span className="text-emerald-400 font-bold">{opponentName}</span> for counter-move.
          </p>
      </div>
      <Button onClick={() => setGameState(GameState.P2_TURN)} className="bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/30 px-12 py-4 text-lg">
        Identify as {opponentName}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {gameState !== GameState.MENU && gameState !== GameState.SETUP && (
        <header className="p-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center glass-panel rounded-2xl px-6 py-4">
            <button onClick={resetGame} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
              <span className="font-bold text-xl tracking-tighter">RPS<span className="text-indigo-400">ARENA</span></span>
            </button>
            
            <div className="flex items-center gap-8">
              <div className="text-right hidden md:block">
                <span className="block text-xs text-indigo-400 font-bold uppercase tracking-wider mb-1">{playerName}</span>
                <span className="text-3xl font-black text-white leading-none">{score.p1}</span>
              </div>
              <div className="h-10 w-px bg-white/10 mx-2"></div>
              <div className="text-left hidden md:block">
                <span className="block text-xs text-pink-400 font-bold uppercase tracking-wider mb-1">{opponentName}</span>
                <span className="text-3xl font-black text-white leading-none">{score.p2}</span>
              </div>
              {/* Mobile Score Compact */}
              <div className="md:hidden flex items-center gap-3 font-bold text-xl">
                 <span className="text-indigo-400">{score.p1}</span>
                 <span className="text-slate-600">-</span>
                 <span className="text-pink-400">{score.p2}</span>
              </div>
            </div>
            
            <button onClick={resetGame} className="p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <RefreshCw size={20} />
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden relative">
        {gameState === GameState.SETUP && renderSetup()}
        {gameState === GameState.MENU && renderMenu()}
        {gameState === GameState.LOBBY && renderLobby()}
        
        {(gameState === GameState.P1_TURN || gameState === GameState.P2_TURN || gameState === GameState.ONLINE_MATCH) && renderGameArea()}
        
        {gameState === GameState.TRANSITION && renderTransition()}
        {gameState === GameState.RESULT && renderResult()}
      </main>
      
      <footer className="p-6 text-center text-slate-500 text-xs font-medium tracking-widest uppercase opacity-60">
        System Core: Google Gemini  //  Ui: React 19
      </footer>
    </div>
  );
};

export default App;