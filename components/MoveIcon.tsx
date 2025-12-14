import React from 'react';
import { Hand, Scissors, Hexagon } from 'lucide-react';
import { Move } from '../types';

interface MoveIconProps {
  move: Move;
  size?: number;
  className?: string;
  animate?: boolean;
}

export const MoveIcon: React.FC<MoveIconProps> = ({ move, size = 24, className = "", animate = false }) => {
  const getAnimationClass = () => {
    if (!animate) return "";
    switch (move) {
      case Move.ROCK: return "animate-rock-smash";
      case Move.PAPER: return "animate-paper-float";
      case Move.SCISSORS: return "animate-scissors-snip";
      default: return "";
    }
  };

  const finalClass = `${className} ${getAnimationClass()}`;

  switch (move) {
    case Move.ROCK:
      // Using Hexagon to represent a rock/stone shape
      return <Hexagon size={size} className={`${finalClass} fill-current`} />;
    case Move.PAPER:
      return <Hand size={size} className={finalClass} />;
    case Move.SCISSORS:
      return <Scissors size={size} className={finalClass} />;
    default:
      return null;
  }
};