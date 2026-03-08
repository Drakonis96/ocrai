import React from 'react';

type ButtonVariant = 'default' | 'primary' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md';

interface IconActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-white',
  primary:
    'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:border-blue-800 dark:hover:bg-blue-900/40',
  danger:
    'border-red-200 bg-red-50 text-red-600 hover:border-red-300 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300 dark:hover:border-red-800 dark:hover:bg-red-900/30',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-900/30',
};

const ACTIVE_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white',
  primary:
    'border-blue-500 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white',
  danger:
    'border-red-500 bg-red-600 text-white dark:border-red-500 dark:bg-red-500 dark:text-white',
  success:
    'border-emerald-500 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-white',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-11 px-3.5 text-sm',
};

const LABEL_EXPANDED_CLASSES =
  'max-w-[10rem] opacity-100 ml-2';

const LABEL_COLLAPSED_CLASSES =
  'max-w-0 opacity-0 ml-0 group-hover:max-w-[10rem] group-hover:opacity-100 group-hover:ml-2 group-focus-visible:max-w-[10rem] group-focus-visible:opacity-100 group-focus-visible:ml-2';

const IconActionButton: React.FC<IconActionButtonProps> = ({
  icon,
  label,
  isActive = false,
  variant = 'default',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const interactiveClasses = isActive ? ACTIVE_VARIANT_CLASSES[variant] : VARIANT_CLASSES[variant];

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      aria-label={label}
      className={[
        'group inline-flex items-center justify-center rounded-full border shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASSES[size],
        interactiveClasses,
        className,
      ].join(' ')}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span
        className={[
          'overflow-hidden whitespace-nowrap font-medium transition-all duration-200',
          isActive ? LABEL_EXPANDED_CLASSES : LABEL_COLLAPSED_CLASSES,
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  );
};

export default IconActionButton;
