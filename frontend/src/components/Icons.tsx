// Small inline stroke icons. Decorative: always aria-hidden.
type P = { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'aria-hidden': true,
})

export const CheckIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2.6} className={className}><path d="m5 12 5 5 9-10" /></svg>
)
export const FlagIcon = ({ size = 13, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}><path d="M5 21V4h11l-1.5 4L16 12H5" /></svg>
)
export const XIcon = ({ size = 13, className }: P) => (
  <svg {...base(size)} strokeWidth={2.6} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const DocQuestionIcon = ({ size = 13, className }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}><path d="M14 3H6v18h12V7z" /><path d="M10 11a2 2 0 1 1 2.5 1.9V14M12 17h.01" /></svg>
)
export const LockIcon = ({ size = 13, className }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)
export const ArrowRightIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const PenIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>
)
export const FolderIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 7h6l2 2h10v10H3z" /></svg>
)
export const UploadIcon = ({ size = 28, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></svg>
)
export const DocIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}><path d="M14 3H6v18h12V7z" /><path d="M9 13h6M9 17h4" /></svg>
)
export const PersonIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
)
export const ScaleIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z" /></svg>
)
