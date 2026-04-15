# Design System Document: Academic Clarity & Editorial Precision

## 1. Overview & Creative North Star: "The Digital Registrar"
The Creative North Star for this design system is **"The Digital Registrar."** We are moving away from the cluttered, bureaucratic aesthetic typical of academic portals and toward a high-end, editorial experience that mirrors the precision of Vercel and the fluid trust of Stripe.

This system rejects the "standard" admin dashboard look. Instead, it utilizes **Intentional Asymmetry** and **Bento-style composition** to guide the user’s eye. We break the template by treating the login experience not as a form, but as a prestigious entry point. Expect expansive breathing room, layered translucency (Glassmorphism), and a hierarchy defined by tonal shifts rather than rigid lines.

---

## 2. Colors: The Fluid Spectrum
Our palette is anchored in deep blues and crisp whites, but its soul lies in the "interstitial" tones.

### The "No-Line" Rule
**Explicit Instruction:** You are prohibited from using 1px solid borders to define sections. Layout boundaries must be achieved through background shifts. For example, a `surface-container-low` login card should sit on a `surface` background. If you need more definition, use a tonal shift, never a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of frosted glass.
- **Base Layer:** `surface` (#f7f9fb)
- **Secondary Sectioning:** `surface-container-low` (#f2f4f6)
- **Primary Interaction Cards:** `surface-container-lowest` (#ffffff)
- **Active Overlays:** `surface-bright` (#f7f9fb)

### The "Glass & Gradient" Rule
To achieve the high-conversion, premium feel:
- **Glassmorphism:** Use semi-transparent variants of `surface-container-lowest` with a `backdrop-blur-xl` (Tailwind v4) to create floating cards.
- **Signature Gradients:** For the primary action, use a linear gradient from `primary` (#004bca) to `primary-container` (#0061ff). This adds "visual soul" that a flat hex code cannot provide.

---

## 3. Typography: Editorial Authority
We use a dual-font strategy to balance character with readability.

*   **Display & Headlines (Manrope):** Chosen for its geometric precision and modern "tech-editorial" feel. Use `display-lg` for welcome messages to create an immediate sense of scale.
*   **Body & Labels (Inter):** The industry standard for legibility. Its neutrality allows the layout's structure to shine without distracting the user.

**Hierarchy as Identity:**
- **Primary Headers:** `headline-lg` (Manrope) with tight letter-spacing (-0.02em) for an authoritative, "locked-in" look.
- **Labels:** `label-md` (Inter) in `on-surface-variant` for metadata and secondary guidance.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows and borders are replaced by light-physics-based depth.

*   **The Layering Principle:** Place a card using `surface-container-lowest` (pure white) inside a wrapper of `surface-container-low` to create a "soft lift."
*   **Ambient Shadows:** For the main login card, use an extra-diffused shadow. 
    - `shadow-[0px_32px_64px_-12px_rgba(0,75,202,0.08)]` — Note the use of a blue-tinted shadow (from the `primary` token) rather than grey, mimicking natural light passing through blue-tinted glass.
*   **The "Ghost Border" Fallback:** If a container lacks contrast, use a 1px border with `outline-variant` at **10% opacity**. It should be felt, not seen.
*   **Glassmorphism:** All floating elements (like tooltips or segmented controls) must use `bg-white/70` with `backdrop-blur-md` to integrate with the background gradients.

---

## 5. Components: The Bento Experience

### Floating Label Inputs
Instead of static labels, use floating labels that transition from `body-lg` to `label-sm` upon focus. 
- **Style:** Background-less inputs with a 2px `primary` bottom-accent that expands from the center on focus. No encompassing boxes.

### Bento-Style Buttons
Buttons should feel like "tiles" within the layout.
- **Primary:** Gradient (`primary` to `primary-container`), `rounded-xl`, with a subtle white `inner-glow` (top border-white/20).
- **Secondary:** `surface-container-high` background with `on-surface` text. No border.

### Segmented Controls (Role Selection)
For switching between "Student" and "Faculty":
- A pill-shaped container using `surface-container-highest` with a sliding "glass" indicator (`surface-container-lowest` with a subtle shadow) that moves behind the active text.

### Cards & Lists
**Strict Rule:** No dividers (`<hr>`). Use vertical whitespace (spacing scale `8` or `12`) or a subtle shift from `surface-container-low` to `surface-container-highest` to differentiate content blocks.

### Additional Component: The "Status Bento"
A small, non-interactive card cluster showing real-time portal stats (e.g., "98% Clearance Rate") using `tertiary` (#9d3000) accents to draw the eye toward "success" metrics, boosting user confidence during login.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `primary-fixed-dim` for subtle background glows behind the login card to add depth.
*   **Do** use `manrope` for any number-heavy data—its geometric nature feels more "calculated" and "secure."
*   **Do** ensure the `on-surface` text color has a minimum 4.5:1 contrast ratio against your glass containers.

### Don't
*   **Don't** use pure black (#000). Always use `on-surface` (#191c1e) for text to maintain the high-end, soft-minimalist aesthetic.
*   **Don't** use standard `rounded-md`. Use `rounded-xl` (0.75rem) for cards and `rounded-full` for chips to emphasize the "Modern/Stripe" feel.
*   **Don't** use "Drop Shadows" on everything. If everything floats, nothing has weight. Reserve shadows for the *one* primary login container.

---

## 7. Tailwind CSS v4 Variables Reference (Key Tokens)