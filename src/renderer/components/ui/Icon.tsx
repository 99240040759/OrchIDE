import React from 'react';

export interface IconProps extends React.HTMLAttributes<HTMLElement> {
  name: string; // The codicon name without the 'codicon-' prefix, e.g., 'check', 'zap'
  size?: number | string;
  color?: string;
  opacity?: number;
  className?: string;
  spin?: boolean;
}

export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 14, 
  color, 
  opacity,
  className = '', 
  spin = false,
  style,
  ...props 
}) => {
  return (
    <i 
      className={`codicon codicon-${name} ${spin ? 'spin' : ''} ${className}`}
      style={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        color,
        opacity,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
      {...props}
    />
  );
};
