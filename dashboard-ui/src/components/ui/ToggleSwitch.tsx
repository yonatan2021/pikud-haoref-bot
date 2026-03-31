import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ value, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${value ? 'bg-amber' : 'bg-white/10'}`}
      role="switch"
      aria-checked={value}
    >
      <motion.span
        className="absolute h-4 w-4 rounded-full bg-white shadow"
        style={{ top: 4, left: 0 }}
        animate={{ x: value ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
