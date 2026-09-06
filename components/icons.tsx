import type { SVGProps } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Camera as CameraGlyph } from "@phosphor-icons/react/dist/ssr/Camera";
import { ArrowRight as ArrowGlyph } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Check as CheckGlyph } from "@phosphor-icons/react/dist/ssr/Check";
import { CaretRight as ChevronGlyph } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { X as CloseGlyph } from "@phosphor-icons/react/dist/ssr/X";
import { Image as ImageGlyph } from "@phosphor-icons/react/dist/ssr/Image";
import { Info as InfoGlyph } from "@phosphor-icons/react/dist/ssr/Info";
import { LockSimple as LockGlyph } from "@phosphor-icons/react/dist/ssr/LockSimple";
import { ArrowsClockwise as RefreshGlyph } from "@phosphor-icons/react/dist/ssr/ArrowsClockwise";
import { Export as ShareGlyph } from "@phosphor-icons/react/dist/ssr/Export";
import { Sparkle as SparkGlyph } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { UploadSimple as UploadGlyph } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { DownloadSimple as DownloadGlyph } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { PencilSimple as PencilGlyph } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Keyboard as KeyboardGlyph } from "@phosphor-icons/react/dist/ssr/Keyboard";
import { MagnifyingGlass as ZoomGlyph } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Eraser as EraserGlyph } from "@phosphor-icons/react/dist/ssr/Eraser";
import { ArrowCounterClockwise as UndoGlyph } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
import { ArrowClockwise as RedoGlyph } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { TrashSimple as TrashGlyph } from "@phosphor-icons/react/dist/ssr/TrashSimple";
import { Copy as CopyGlyph } from "@phosphor-icons/react/dist/ssr/Copy";
import { BookOpen as BookGlyph } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { Question as QuestionGlyph } from "@phosphor-icons/react/dist/ssr/Question";
import { PaperPlaneTilt as SendGlyph } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { Star as TutorGlyph } from "@phosphor-icons/react/dist/ssr/Star";

type IconProps = SVGProps<SVGSVGElement>;
// Direct icon imports avoid loading the full catalogue during development.
const themedIcon = (Glyph: Icon) => function ThemedIcon(props: IconProps) {
  return <Glyph size={24} weight="regular" aria-hidden="true" focusable="false" {...props}/>;
};

export const CameraIcon = themedIcon(CameraGlyph);
export const ArrowIcon = themedIcon(ArrowGlyph);
export const CheckIcon = themedIcon(CheckGlyph);
export const ChevronIcon = themedIcon(ChevronGlyph);
export const CloseIcon = themedIcon(CloseGlyph);
export const ImageIcon = themedIcon(ImageGlyph);
export const InfoIcon = themedIcon(InfoGlyph);
export const LockIcon = themedIcon(LockGlyph);
export const RefreshIcon = themedIcon(RefreshGlyph);
export const ShareIcon = themedIcon(ShareGlyph);
export const SparkIcon = themedIcon(SparkGlyph);
export const UploadIcon = themedIcon(UploadGlyph);
export const DownloadIcon = themedIcon(DownloadGlyph);
export const PencilIcon = themedIcon(PencilGlyph);
export const KeyboardIcon = themedIcon(KeyboardGlyph);
export const ZoomIcon = themedIcon(ZoomGlyph);
export const EraserIcon = themedIcon(EraserGlyph);
export const UndoIcon = themedIcon(UndoGlyph);
export const RedoIcon = themedIcon(RedoGlyph);
export const TrashIcon = themedIcon(TrashGlyph);
export const CopyIcon = themedIcon(CopyGlyph);
export const BookIcon = themedIcon(BookGlyph);
export const QuestionIcon = themedIcon(QuestionGlyph);
export const SendIcon = themedIcon(SendGlyph);
export const TutorIcon = themedIcon(TutorGlyph);

// Keep the existing product mark, independent of the UI icon library.
const Base = ({ children, ...props }: IconProps) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
export const NetworkIcon = (props: IconProps) => <Base {...props}><circle cx="12" cy="4.8" r="2.4"/><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="18.5" r="2.4"/><path d="M12 7.2v2.6c0 3.2-6.5 3.1-6.5 6.3M12 9.8c0 3.2 6.5 3.1 6.5 6.3"/></Base>;
