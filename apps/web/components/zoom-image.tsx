"use client";

import { ImageOff, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

// Миниатюра, по нажатию открывающаяся крупно в окне. src уже прошёл safeHttpUrl; null — заглушка без нажатия.
// Нативный <dialog>: Esc, возврат фокуса и затемнение работают без библиотек; крупная картинка грузится только при открытии (loading="lazy").
export function ZoomImage({ src, title, className }: { src: string | null; title: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = cn("relative shrink-0 rounded-lg bg-white", className);

  if (!src) return (
    <span className={box}>
      <ImageOff className="text-muted-foreground/60 absolute inset-0 m-auto size-6" aria-label="Нет фото" role="img" />
    </span>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Увеличить фото: ${title}`}
        className={cn(box, "focus-visible:ring-ring/50 cursor-zoom-in outline-none focus-visible:ring-3")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby */}
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-contain p-1" />
      </button>
      <dialog
        ref={dialog}
        // Нажатие на затемнённый фон или поля окна закрывает его (сама картинка и кнопки не закрывают).
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        aria-label={title}
        className="m-auto max-h-[92dvh] w-[min(92vw,640px)] rounded-2xl bg-white p-3 backdrop:bg-black/70"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby */}
        <img src={src} alt={title} loading="lazy" referrerPolicy="no-referrer" className="mx-auto max-h-[75dvh] w-full object-contain" />
        <p className="mt-2 pr-12 text-sm break-words text-black">{title}</p>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Закрыть"
          className="focus-visible:ring-ring/50 absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-black/60 text-white outline-none focus-visible:ring-3"
        >
          <X className="size-5" aria-hidden />
        </button>
      </dialog>
    </>
  );
}
