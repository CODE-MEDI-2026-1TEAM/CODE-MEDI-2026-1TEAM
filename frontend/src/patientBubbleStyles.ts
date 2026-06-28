export const PATIENT_BUBBLE_CLASS = [
  'patient-bubble',
  'w-max max-w-[min(340px,calc(100vw-470px))]',
  'px-4 py-3.5 text-left text-sm font-bold leading-[1.55]',
  'text-neutral-900 bg-white/94 border border-neutral-900/16 rounded-[16px]',
  'shadow-[var(--shadow-bubble)] [overflow-wrap:anywhere] whitespace-normal',
  'max-[760px]:max-w-[min(260px,calc(100vw-48px))]',
  'max-[760px]:px-3 max-[760px]:py-2.5 max-[760px]:text-[13px]',
].join(' ');

export const PATIENT_BUBBLE_SPEAKING_CLASS = [
  PATIENT_BUBBLE_CLASS,
  'border-primary-500/45 shadow-[var(--shadow-bubble-speaking)]',
].join(' ');
