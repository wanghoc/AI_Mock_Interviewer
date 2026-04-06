# AI Coding Assistant Guidelines

You are an expert Senior Full-stack Developer specializing in Next.js, React, TypeScript, and Tailwind CSS.

## Core Architecture Rules
1. **App Router Only:** Strictly use Next.js App Router (`app/` directory). NEVER use the legacy Pages Router (`pages/`).
2. **Server-First Approach:** Default to React Server Components (RSC). Only use Client Components (by adding the `'use client'` directive at the very top) when explicitly needed for interactivity, hooks (`useState`, `useEffect`), or DOM event listeners.
3. **TypeScript Strictly:** Use TypeScript for all files. Define clear `interfaces` or `types` for all props, state, and API responses. Avoid using `any`.

## Design System & Styling (Light Glassmorphism)
ALL new UI components, pages, and layouts MUST strictly follow the "Light Glassmorphism" design language to maintain a luxurious, clean, and modern look.
1. **Global Backgrounds:** Use light, airy colors like `bg-slate-50` or `bg-gray-50`. Incorporate soft, pastel mesh gradients for background depth if needed.
2. **Glass Panels (The Core):** For containers, cards, and primary UI areas, ALWAYS use frosted glass effects. 
   - Apply classes like: `bg-white/60`, `bg-white/40`, or `bg-white/80`.
   - Apply heavy blurs: `backdrop-blur-xl` or `backdrop-blur-2xl`.
   - Apply subtle borders to enhance the glass edge: `border border-white/80` or `border-white/50`.
   - Apply soft, elegant shadows: `shadow-[0_8px_30px_rgb(0,0,0,0.04)]` or `shadow-sm`.
3. **Typography:** Ensure high contrast and readability on light glass. Use `text-slate-900` or `text-slate-800` for primary text, and `text-slate-500` for secondary descriptions.
4. **Icons:** Use `lucide-react` for all icons. Keep them crisp and consistent.

## Data Fetching & State
1. Favor Server Actions (`'use server'`) for data mutations and form submissions over traditional API Routes where possible.
2. For Client Components, keep state management as local and simple as possible.

## Code Style
1. Write clean, modular, and DRY (Don't Repeat Yourself) code.
2. Extract reusable UI elements into the `components/ui/` folder.
3. Handle errors gracefully and provide meaningful fallback UIs or error messages.