# Optical E-Commerce Project — Agent Instructions

## Role

Act as a senior product designer, frontend engineer, backend engineer and QA engineer.

Build a premium optical retail e-commerce platform with exceptional visual design, reliable functionality and a maintainable architecture.

Primary visual reference:
https://www.aceandtate.com/us/sunglasses/men-sunglasses

Use the reference for design direction and interaction patterns. Do not copy its logo, proprietary assets or product photography.

## 1. Design Standards

- Prioritise visual quality, whitespace, typography and product photography.
- Maintain a consistent design system across the customer website.
- Derive actual colours, typography, spacing and dimensions from reference inspection wherever possible.
- Store design tokens centrally.
- Avoid unnecessary gradients, excessive shadows, oversized rounded cards and generic SaaS styling.
- Use subtle hover transitions and restrained animations.
- Never use random colours or inconsistent spacing.
- Use original brand assets and appropriate licensed or generated product images.

## 2. Customer Website Requirements

Main navigation:
- Eyeglasses
- Sunglasses
- Accessories
- Contact Lenses
- Eye Care
- Search
- Wishlist
- Account/Login
- Cart

Homepage:
- Premium editorial hero.
- Eyeglasses by gender, brand and shape.
- Sunglasses by gender, brand and shape.
- Accessories.
- Contact Lenses.
- Eye Care editorial articles.
- Promotional sections.
- Enquire & Order on WhatsApp.
- Book Eye Test.

Product categories must be driven by backend data and admin configuration.

## 3. Product Experience

Product listings must include:
- Studio and model-wearing images.
- Product names and prices in INR.
- Colour variants.
- Wishlist actions.
- Brand information.
- Working filters and sorting.

Filters:
- Gender.
- Brand.
- Frame shape.
- Frame width.
- Material.
- Colour.
- Price.
- Availability.

Product details must include:
- Image gallery and zoom.
- Product information.
- Frame measurements in millimetres.
- Lens width, bridge width and temple length.
- Colour variants.
- Stock status.
- Add to Cart.
- Wishlist.
- Select Lenses.
- WhatsApp Enquiry.

## 4. Lens Selection

Create a progressive four-step experience:

1. Lens Usage.
2. Prescription.
3. Lens Thickness.
4. Lens Coatings.

Show:
- Current selected frame.
- Progress indicator.
- Prescription upload and manual input.
- Configurable lens options.
- Live pricing updates.
- Final order summary.

Lens options and pricing must be admin-managed.

## 5. WhatsApp and Eye Test

WhatsApp:
- Use a configurable business number.
- Generate a prefilled product or cart enquiry.
- Include product name, SKU, price, colour, quantity and selected lens options.
- Use correct URL encoding.
- Do not mark an enquiry as a confirmed order just because WhatsApp opens.

Eye Test:
- Store/branch selection.
- Date selection.
- Available appointment slots.
- Customer details.
- Appointment submission.
- Admin confirmation and management.
- Prevent overlapping confirmed bookings.

## 6. Admin Portal

Create a separate, secure and responsive management interface.

Admin must be able to manage:

- Products.
- Product images and variants.
- Brands and brand logos.
- Frame shapes and icons.
- Gender categories.
- Accessories and dynamic subcategories.
- Contact lenses.
- Lens options and pricing.
- Stock and availability.
- Eye Care articles.
- Homepage promotional content.
- WhatsApp configuration.
- Store timings.
- Appointments.
- Customer enquiries.

Adding a new brand, shape or accessory category must not require a frontend code change.

The customer website must automatically retrieve active content from the backend.

## 7. Engineering Standards

Before changing code:

1. Inspect the existing repository.
2. Understand the existing framework and architecture.
3. Identify existing reusable components and services.
4. Identify database structures and dependencies.
5. Prepare an implementation plan.

Do not unnecessarily replace an existing technology stack.

Do not invent an architecture before inspecting the repository.

Use TypeScript where appropriate and follow existing project conventions.

Keep frontend, backend, database and infrastructure responsibilities clear.

Implement:
- Server-side validation.
- Authentication.
- Role-based access control.
- Secure file uploads.
- Proper API error handling.
- Database constraints.
- Loading, empty and error states.
- Environment-based configuration.

Never expose secrets or credentials in frontend code.

Never hardcode admin-managed products, categories or prices.

Avoid fake interactions, placeholder buttons and unimplemented features presented as completed.

## 8. Responsive Design

Test:
- 1440px desktop.
- 1024px.
- 768px.
- 390px mobile.
- 360px mobile.

Mobile must have:
- Proper navigation.
- Touch-friendly product galleries.
- Usable filtering.
- Sticky shopping actions.
- Responsive product grids.
- Minimum touch targets around 44px.
- No horizontal overflow.

Do not treat mobile as a scaled-down desktop layout.

## 9. Visual Quality Assurance

Use Antigravity browser capabilities to inspect:

- The Ace & Tate reference.
- Our local homepage.
- Category pages.
- Product details.
- Admin screens.
- Mobile views.

Capture screenshots at comparable viewport sizes.

Compare:
- Background and text colours.
- Typography.
- Header height.
- Container widths.
- Spacing.
- Image proportions.
- Grid density.
- Product cards.
- Filter interactions.
- Mobile navigation.

Iteratively fix visible differences.

Inspect console errors and failed network requests.

Do not declare visual testing complete without actually testing the website.

## 10. Development Workflow

Work in clearly separated stages:

Stage 1: Repository inspection and reference analysis.

Stage 2: Design system and customer homepage.

Stage 3: Navigation, category pages and product listings.

Stage 4: Product details and lens selection.

Stage 5: Cart, WhatsApp and appointment booking.

Stage 6: Admin portal and dynamic management.

Stage 7: Database and backend integration.

Stage 8: Security, performance, SEO and responsive improvements.

Stage 9: Functional and visual QA.

At the end of every stage:
- Summarise completed features.
- List changed files.
- Report tests executed.
- List unresolved issues.
- Record the next implementation stage.

Do not sacrifice functionality for visual appearance or visual quality for fast implementation.

The final website should feel like a premium, genuine optical retail brand, not a generic generated template.