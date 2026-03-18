# Logo Update Instructions

## File to add to your public folder
Place `fixsense_icon_logo.png` in your `public/` directory.

---

## DashboardLayout.tsx — Already correct ✅
The `FixsenseLogo` component in `DashboardLayout.tsx` already references:
  `src="/fixsense_icon_logo.png"`
No changes needed here — just make sure the PNG is in `public/`.

---

## LandingPage.tsx — Updated ✅
Full file provided as `LandingPage.tsx` output.
- Replaced all `<div className="lp-logo-mark"><Zap /></div>` with `<FixsenseLogo>` image component
- Navbar, mobile drawer, and footer all use the real PNG logo

---

## LoginPage.tsx — 3 replacements needed

### Replacement 1 — Desktop left panel logo (~line 233)
**FIND:**
```jsx
<div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #2dd4bf, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
  <Zap style={{ width: "16px", height: "16px", color: "#030712" }} />
</div>
```
**REPLACE WITH:**
```jsx
<img src="/fixsense_icon_logo.png" alt="Fixsense" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "contain", flexShrink: 0 }} />
```

### Replacement 2 — Mobile hero logomark (~line 395)
**FIND:**
```jsx
<div className="mobile-hero-logomark">
  <Zap style={{ width: "16px", height: "16px", color: "#030712" }} />
</div>
```
**REPLACE WITH:**
```jsx
<div className="mobile-hero-logomark" style={{ background: "none", padding: 0 }}>
  <img src="/fixsense_icon_logo.png" alt="Fixsense" style={{ width: 38, height: 38, borderRadius: 11, objectFit: "contain", display: "block" }} />
</div>
```

### Replacement 3 — Remove Zap from imports
**FIND:**
```
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
```
**REPLACE WITH:**
```
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
```

---

## PricingPage.tsx — 1 replacement needed

**FIND:**
```jsx
<div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
  <Zap className="w-4 h-4 text-primary-foreground" />
</div>
```
**REPLACE WITH:**
```jsx
<img src="/fixsense_icon_logo.png" alt="Fixsense" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain" }} />
```

Also in the footer of PricingPage:
**FIND:**
```jsx
<div className="w-6 h-6 rounded gradient-accent flex items-center justify-center">
  <Zap className="w-3 h-3 text-primary-foreground" />
</div>
```
**REPLACE WITH:**
```jsx
<img src="/fixsense_icon_logo.png" alt="Fixsense" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "contain" }} />
```
