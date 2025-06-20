import React from 'react';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
}

const Card = ({ children, onClick }: CardProps) => {
  return (
    <div
      className="bg-white/10 border border-white/20 rounded-xl p-6 cursor-pointer hover:bg-white/20 transition-all"
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default Card;