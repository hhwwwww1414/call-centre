# CRM interface system

The redesign preserves existing routes, roles, entities, data, filters, exports,
and call/contact workflows. Shared components carry the visual system through
dashboard, calls, contacts, profile, authentication, and administration.

- **Surfaces:** cool off-white workspace, lightly tinted navigation, solid white
  content. Dark mode uses separate graphite workspace, card, and overlay tones.
- **Color:** VIN2WIN green denotes actions, selection, links, focus, and success;
  amber and red denote attention and errors. Charts use green shades with
  semantic and neutral supporting colors. The existing logo is retained.
- **Type:** Inter throughout, medium/semibold hierarchy, tabular numeric data.
- **Geometry:** 10px controls, 14px cards, 18px overlays. Shadows remain subtle.
- **Tables:** quiet headers, 58px data rows, horizontal separators, hover and
  keyboard focus states. Mobile keeps the existing card-list presentation.
- **Responsive behavior:** expanded sidebar on desktop, icon rail on tablet,
  bottom navigation on mobile. Contact editing and history use tabs below the
  desktop breakpoint. Phone controls remain touch-sized and forms avoid iOS zoom.
- **Motion:** 150–220ms control, menu, and drawer transitions. Reduced-motion
  preferences disable animations. Translucency is limited to navigation and menus.

Tokens live in `app/globals.css`; reusable controls live in `components/ui`.
Existing native date inputs and telephone links are retained. No simulated chat,
softphone, or other unsupported product functionality is introduced.

Validation: TypeScript, ESLint, unit tests, theme browser tests, and visual checks
of 11 routes at 375px, 768px, and 1440px. Interaction checks cover date filtering,
opening/closing call details, sidebar collapse, mobile filters, and contact tabs.
