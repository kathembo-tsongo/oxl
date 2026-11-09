# OXL MVP — User stories (Week 1, task 1)

Source: *OXL MVP Conceptual Design* (sections 2–9). Each story has acceptance checks used in the
weekly reviews and in Week 5 user testing. Gantt milestone in brackets.

## Sellers (exporters)

| # | As a seller, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| S1 | sign up and create my business profile, alone or with an agent | buyers can find me | Profile saved as *self-declared*; appears in the directory | M2 |
| S2 | upload my registration, export licence and certificates | OXL can verify me | File stored privately; AI reads key details; status *pending* | M3 |
| S3 | list what I sell with grade, quantity, price, **ready date, monthly capacity and collection town/port** | I am matched with buyers I can actually deliver to | Offer saved with all fields; can be edited and closed | M3 |
| S4 | see buyers ranked for my offer, with reasons | I contact the best ones first | Ranked list with score and reasons, including estimated arrival | M4 |
| S5 | accept or decline a buyer's interest and follow the deal to delivery | both sides know where the deal stands | Statuses: proposed → accepted → in transit → delivered → completed | M4 |
| S6 | ask for trade finance and choose which lenders see my trust report | I can fund the order | Finance request saved; report visible only to lenders I choose; I can withdraw | M4 |
| S7 | allow or stop my agent seeing my documents | I stay in control of my data | Consent switch works; withdrawal removes the agent's access immediately | M2 |

## Buyers (importers)

| # | As a buyer, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| B1 | post what I need with grade, quantity, target price, **needed-by date, delivery town/port and transport mode** | OXL finds sellers who can deliver in time | Request saved with all fields | M3 |
| B2 | see only sellers who pass the must-pass checks, ranked out of 100 with reasons | I don't waste time on sellers who can't deliver | Late, short, uncertified, suspended or sanctioned sellers are excluded | M4 |
| B3 | read a seller's trust report and verification history | I know how well the seller has been checked | Trust level, documents, field visits and ratings shown | M4 |
| B4 | confirm delivery and rate the seller (on time? quality as described?) | good sellers rise and bad ones are visible | Rating possible only after delivery; feeds the reliability score | M4 |
| B5 | be alerted when a seller's ready date changes | I can react early | Email sent; match re-checked | M5 |

## Agents and brokers

| # | As an agent, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| A1 | register with my ID, licence (if any), areas covered, references and signed code of conduct | OXL and users can trust me | Agent profile saved; documents pending OXL review | M2 |
| A2 | onboard farmers and exporters with their recorded consent | clients who are offline can join | Client profile created and linked; consent method and date recorded | M2 |
| A3 | post offers and upload documents for my clients | I can do the paperwork for them | Allowed only while consent is active; never for non-clients | M2–M3 |
| A4 | see matches for my clients and introduce deals, with my fee shown to both sides | my work is credited | Deal records the agent and fee; both sides see the fee | M4 |
| A5 | see my clients, deals, fees and performance record on my dashboard | I can grow my business | Dashboard shows clients, deals introduced, delivery rate, complaints | M4 |
| A6 | invite prospects assigned to me | I bring new businesses to OXL | Can view and mark assigned prospects as invited | M5 |
| A7 | *never* verify my own clients or see their documents without permission | OXL stays trustworthy | Enforced by database rules (tested) | M1–M2 |

## Lenders

| # | As a lender, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| L1 | see open finance requests | I find businesses to lend to | List of open requests with amount and purpose | M4 |
| L2 | read trust reports that businesses have shared with me | I decide faster | Report visible only when shared; disappears when consent is withdrawn | M4 |

## Support organisations (chambers, export agencies, associations)

| # | As a partner, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| P1 | confirm which businesses are my members | my overview is accurate | Member requests can be confirmed or removed | M4 |
| P2 | see my members by country, type and trust level | I know how they are doing | Partner dashboard with counts and list | M4 |

## OXL team (staff and field officers)

| # | As OXL staff, I want to… | So that… | Acceptance checks | Milestone |
|---|---|---|---|---|
| O1 | review documents with the AI's findings and set trust levels | businesses and agents are checked consistently | Every change logged with who, how and when | M3 |
| O2 | record field visits with outcome and findings | *field verified* means a real visit took place | Visit saved; visible in the trust report | M3 |
| O3 | maintain locations, routes, certificate rules, the sanctions list and the safety margin | matching uses correct data | Only staff can edit; everyone can read (except sanctions) | M3 |
| O4 | suspend a business or agent that misleads users | users are protected | Suspended firms disappear from matching; agents lose client access | M3 |
| O5 | upload a prospect list, have AI score it, assign prospects to agents and send invitations | OXL grows beyond current users | Prospects marked *not verified*; opt-out deletes them | M5 |

## Out of scope for the MVP (later phases)

Trade-rules assistant, WhatsApp/SMS notifications, live shipping schedules, paid shipment databases,
delay prediction, combining several sellers into one order, automatic agent fee statements.
