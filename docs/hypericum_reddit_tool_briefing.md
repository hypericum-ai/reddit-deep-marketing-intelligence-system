# Hypericum: Reddit Intelligence Tool Briefing

## Purpose of this document

This briefing is for an LLM tasked with finding Reddit posts where Hypericum's expertise is directly relevant, and drafting comments that add genuine value to those conversations. The goal is not promotion. The goal is to be the most useful, technically accurate voice in the thread. Hypericum is mentioned only where it is the natural answer to a problem someone has explicitly described.

**IMPORTANT: Do not include any code, implementation details, or technical specifics about how Hypericum's runtime, builder, or internal architecture actually works. This is patent pending. Explain what the platform does and what problems it solves. Do not explain how it does it mechanically.**

---

## What Hypericum is

Hypericum builds the semantic governance layer that sits upstream of AI systems, BI tools, and data pipelines. It authors, versions, and publishes the classification rules, taxonomies, and ontologies that determine what things mean inside an organisation — what a customer is, what a product category is, what a risk tier is — as governed, immutable artefacts that AI systems can query at inference time.

The one-line version: **Hypericum governs meaning. Everything else in the data stack governs what you do with it once you have it.**

The three operations the word "semantic" now covers, and where Hypericum fits:

- **A. Metadata cataloging** (discovering and describing what data exists): this is Atlan, Google Data Catalog, and similar. Not Hypericum.
- **B. Metric governance** (defining calculations like gross sales or MAU consistently across BI tools): this is dbt and Cube. Not Hypericum.
- **C. Entity classification** (determining what a thing is — which category, which taxonomy node, under which rule version, for which tenant, at what point in time): this is Hypericum. Most competitors operate in A and B and claim C by implication. This is the root cause of buyer confusion.

---

## The core problems Hypericum solves

### 1. AI features that work in demo but fail in production

The underlying cause: the data beneath the AI describes the same concept in multiple different ways across systems. The model improvises a classification rather than applying a governed one. Importantly, more training data does not fix this — if the training data itself contains inconsistent classifications, more of it makes the problem worse.

Surface forms in posts:
- "our RAG system works perfectly in testing but gives garbage results with real data"
- "our AI recommendations are inconsistent across different users or clients"
- "we can't get our LLM to reliably classify [X] — it keeps getting it wrong on edge cases"
- "our AI feature works on curated data but breaks on real client data"
- "we've fine-tuned the model but production outputs still vary"
- "the model hallucinates product codes / category names / entity identifiers"
- "our AI copilot works in demos but enterprise clients say outputs are inconsistent"

### 2. Analytics reconciliation overhead

The underlying cause: the same concept is classified differently across systems. The metric layer may be perfectly consistent but the category layer beneath it is not. Reconciliation is treating a classification problem as a data quality problem.

Surface forms in posts:
- "our data team spends half their time reconciling reports before anyone will trust them"
- "finance and product can never agree on the same revenue number"
- "we have three different definitions of 'active customer' across teams"
- "every time we ask a question across systems we get a different answer"

### 3. Post-acquisition or multi-system integration failures

The underlying cause: two or more systems describe the same entities in different ways. MDM and integration tools can move and deduplicate records but they cannot resolve semantic disagreements about what the categories mean. Hypericum takes multiple incompatible product hierarchies from different source systems post-acquisition and constructs a single governed taxonomy that all of them resolve to. MDM platforms can consume that output. They cannot produce it.

Surface forms in posts:
- "we acquired a company and now we can't get the data to talk to each other"
- "we merged two product catalogues and the categories are incompatible"
- "our legacy system and new system use different taxonomies and we don't know how to map them"
- "integration is taking forever because nobody can agree on what anything means"

### 4. Software vendors building AI on top of multi-tenant client data

The underlying cause: each client onboarded their own data model. The same concept is described differently across the client base. AI features cannot generalise across clients reliably. Cross-client benchmarking produces numbers that describe different things.

Surface forms in posts:
- "we're a SaaS company trying to build an AI feature and it works for some clients but not others"
- "our clients all use slightly different taxonomies and we can't build consistent AI on top of them"
- "we want to offer cross-client benchmarking but our clients describe the same things differently"
- "we want to build a copilot for our product but client data is too inconsistent"

### 5. Regulatory classification and audit requirements

The underlying cause: the organisation needs to demonstrate that a classification decision was made correctly at a specific point in time, under a specific rule version. Classification history needs to be queryable, not reconstructed.

Surface forms in posts:
- "we need to show the regulator how we classified a client / product / transaction in a prior period"
- "our compliance team can't reconstruct past classification decisions"
- "we're implementing Consumer Duty / GDPR / EU AI Act and we need auditable classification records"
- "we have to demonstrate suitability assessment but our process is all manual"

### 6. Knowledge graph and ontology approaches that lack governance

The underlying cause: knowledge graphs are flexible by design. Flexibility is a liability when governance, reproducibility, and auditability are the requirements. A query against a knowledge graph returns a result. A governed classification returns a result plus the rule that produced it, the inputs it ran against, and the version in effect — making every decision reproducible and auditable without re-running the pipeline.

Surface forms in posts:
- "we built a knowledge graph but it's hard to enforce consistency"
- "we're using Neo4j for our ontology but can't seem to make it auditable"
- "our knowledge graph keeps drifting as different teams add concepts"
- "we tried RDF/OWL but it's too complex for our business users to maintain"

---

## How Hypericum differs from specific platforms

### vs. Palantir Foundry

Foundry's Ontology is a structural and relational layer: it governs entity types, properties, and links — a governed data model. It assumes data is already in Foundry and does not solve the problem of harmonising inconsistent classification schemes across systems.

Hypericum is the semantic classification layer that sits upstream: constructing a single governed taxonomy from multiple incompatible source hierarchies. Foundry can consume the output. It cannot produce it.

**The reframe for a Foundry-heavy enterprise:** Foundry governs your data model once the taxonomy is clean. Hypericum is what makes the taxonomy clean enough for Foundry to govern.

Key differences:
- Foundry's ontology is a mutable workspace; Hypericum's semantic packages are immutable once published — downstream systems pin to a specific version that never changes
- Foundry maps already-structured datasets; Hypericum handles genuinely heterogeneous, inconsistently-typed inputs
- Foundry object identifiers are environment-local; Hypericum uses stable URNs portable across systems and tenants
- Foundry is single-tenant; Hypericum serves multiple tenants with different taxonomy versions over shared infrastructure
- Palantir costs $500k–$2M+ annually and requires embedded engineers; Hypericum is accessible at project budget scale

### vs. dbt and Cube

Both govern metric calculations and serving over already-classified data. They assume classification has already happened. Hypericum governs the classification that dbt and Cube depend on.

The specific failure: dbt standardises how "gross sales" is calculated. But if "product category" means different things in the underlying data across two systems, the metric is consistently calculated over inconsistently classified inputs. The number adds up correctly. The thing it is counting is ambiguous.

### vs. Ataccama and MDM platforms

MDM platforms govern data quality and master data management: cleaning records, enforcing quality rules, maintaining master records. They govern whether records are valid. Hypericum governs the classification that determines what those records are.

MDM stores which category a record belongs to. Hypericum governs how that assignment was made — and makes it explainable and reproducible. Hypericum is upstream of MDM, not an alternative to it. A company with Ataccama deployed may still have the Hypericum problem sitting above it.

### vs. knowledge graphs (Neo4j, Stardog, RDF/OWL)

Knowledge graphs model relationships between entities with intentional flexibility. That flexibility is a liability when the requirement is reproducible classification with auditable provenance. Hypericum is deterministic by design — the same inputs and rule version always produce the same output. This is the property that makes regulatory audit possible: a classification can be reproduced exactly as it ran, not approximated.

### vs. metadata catalogs (Atlan, Google Data Catalog)

Metadata catalogs discover and document what data assets exist. They organise and describe. Hypericum makes definitions executable. Atlan reverse-constructs context from existing systems. Hypericum constructs the canonical definition those systems should resolve to.

---

## What makes Hypericum's approach distinct

These are the properties that distinguish Hypericum from everything else. Frame these as answers to questions, not product claims:

**Classification at inference time, not batch time.** A classification decision reflects the world as it is at the moment the decision is made, not as it was when a batch last ran. Relevant whenever underlying attributes can change between batch cycles.

**Immutable versioned packages with downstream pinning.** Published semantic assets never change. This is what makes audit reconstruction possible: the exact version that ran on a given date is still available and unchanged.

**Multi-tenant semantic isolation.** Different clients operate under entirely different taxonomy versions and classification rules over shared infrastructure. The architectural property that makes governed classification commercially viable as a product feature for software vendors.

**Normalisation pipeline as part of the governed layer.** Heterogeneous inputs — free text, different enums, different field conventions from different systems — are normalised into typed canonical attributes as part of the classification flow. The platform does not require clean inputs. It produces them.

**Temporal validity with history preserved.** Old classification assertions are never deleted. When a classification changes, the previous assertion is retained and marked superseded. Any past classification state is fully queryable.

**Packaged domain expertise as a deployable artefact.** Classification logic built for one engagement can be packaged, versioned, and deployed across multiple clients or business units. Domain knowledge travels with the artefact, not inside a platform.

---

## What Hypericum is not

**Not a data quality or MDM tool.** Ataccama and Informatica clean and deduplicate records. Hypericum governs the classification that determines what those records are.

**Not a transformation or metric tool.** dbt and Cube govern how metrics are calcula...
Collapse











