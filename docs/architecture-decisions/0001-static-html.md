# ADR 0001: Keep the public lab site Static HTML

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

The existing public Hugging Face Space is a functioning bilingual static site. It has no server-side computation or private credentials. The immediate goal is to establish reproducible source control and deployment safeguards without creating an unnecessary runtime.

## Decision

Keep the current Static HTML SDK and preserve the verified site assets. Use Node.js development-only tools for validation and browser checks. Do not add a frontend framework, runtime backend, database, or model service in this foundation release.

## Consequences

The website remains inexpensive and simple to operate. Private model access, protected data, RAG, and GIS tool calls require a separately designed authenticated backend and explicit release review. The static frontend must never contain private credentials.
