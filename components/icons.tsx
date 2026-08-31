import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const Base = ({ children, ...props }: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;

export const CameraIcon = (props: IconProps) => <Base {...props}><path d="M4 7.5h3l1.3-2h7.4l1.3 2h3a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></Base>;
export const ArrowIcon = (props: IconProps) => <Base {...props}><path d="M5 12h14M14 7l5 5-5 5"/></Base>;
export const CheckIcon = (props: IconProps) => <Base {...props}><path d="m5 12 4 4L19 6"/></Base>;
export const ChevronIcon = (props: IconProps) => <Base {...props}><path d="m9 18 6-6-6-6"/></Base>;
export const CloseIcon = (props: IconProps) => <Base {...props}><path d="M6 6l12 12M18 6 6 18"/></Base>;
export const ImageIcon = (props: IconProps) => <Base {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/></Base>;
export const InfoIcon = (props: IconProps) => <Base {...props}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></Base>;
export const LockIcon = (props: IconProps) => <Base {...props}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Base>;
export const NetworkIcon = (props: IconProps) => <Base {...props}><circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M12 7.5v4M7.8 15.9l2.7-4.4h3l2.7 4.4"/></Base>;
export const RefreshIcon = (props: IconProps) => <Base {...props}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M17.9 16A7 7 0 0 1 6 18l-2-6"/></Base>;
export const ShareIcon = (props: IconProps) => <Base {...props}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></Base>;
export const SparkIcon = (props: IconProps) => <Base {...props}><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z"/><path d="m18.5 14 .7 2.2 1.8.8-1.8.8-.7 2.2-.7-2.2L16 17l1.8-.8.7-2.2Z"/></Base>;
export const UploadIcon = (props: IconProps) => <Base {...props}><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5h14v-5"/></Base>;
export const PencilIcon = (props: IconProps) => <Base {...props}><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.5 6.7 2.8 2.8"/></Base>;
export const EraserIcon = (props: IconProps) => <Base {...props}><path d="m7 19-3-3a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11.8 19H7Z"/><path d="m9 8 7 7M11.8 19H21"/></Base>;
export const UndoIcon = (props: IconProps) => <Base {...props}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></Base>;
export const RedoIcon = (props: IconProps) => <Base {...props}><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></Base>;
export const TrashIcon = (props: IconProps) => <Base {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></Base>;
