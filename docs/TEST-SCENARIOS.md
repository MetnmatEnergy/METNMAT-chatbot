# Test Scenarios – Metnmat Chatbot

Use these as the **current/last user message** to test intent classification and agent behavior.

---

## Greeting → Sales Agent

| # | User message | Expected intent | What to check |
|---|--------------|-----------------|---------------|
| 1 | Hi | `greeting` | Welcome mentioning Metnmat, lab equipment, support |
| 2 | Hello, what does Metnmat do? | `greeting` or `catalog_query` | Company intro or product overview |

---

## Product Query → Sales Agent

| # | User message | Expected intent | What to check |
|---|--------------|-----------------|---------------|
| 3 | Do you have Ag/AgCl reference electrodes? | `product_query` | Ag/AgCl specs, SKU, variants (PEEK/PTFE/Glass) |
| 4 | Tell me about PEM N117 membrane | `product_query` | N117 specs, applications, shop/contact buttons |
| 5 | What peristaltic pumps do you sell? | `product_query` | equipments category, pump models |
| 6 | Where to buy titanium felt electrode? | `product_query` | Shop + Contact Sales links |
| 7 | SKU for MT-RE-AGCL-P03 | `product_query` | Exact product match by SKU |
| 8 | Show all membranes | `product_query` | membranes category list |

---

## Catalog Query

| # | User message | Expected intent | What to check |
|---|--------------|-----------------|---------------|
| 9 | What products do you have? | `catalog_query` | Overview of 5 categories |
| 10 | Full catalog | `catalog_query` | electrodes, membranes, equipments, etc. |

---

## Support / Issues

| # | User message | Expected intent | What to check |
|---|--------------|-----------------|---------------|
| 11 | I want to report a damaged electrode | `create_issue_ticket` | Empathy + ticket creation |
| 12 | My ticket status | `view_issues` | searchTicketsByUserTool |

---

## Company Info (from metnmat.com)

- **Metnmat Research & Innovations** — private R&D for Metallurgy & Materials
- **Services**: Product/process development, applied research, quality improvement, benchmarking
- **Shop**: https://www.metnmat.com/shop
- **Contact**: contact@metnmat.com, +91-7872686501
