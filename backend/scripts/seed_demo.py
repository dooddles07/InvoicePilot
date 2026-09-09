"""Populate a demo workspace.

    python -m scripts.seed_demo --email demo@example.com

Commits, unlike the test fixture. Refuses to run twice for the same email so a
repeated invocation does not silently double the ledger.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from app.api.deps import get_sessionmaker
from app.models.auth import User
from app.seeds.demo import seed_demo_workspace


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    with get_sessionmaker()() as session:
        existing = session.scalar(select(User).where(User.email == args.email))
        if existing is not None:
            print(f"{args.email} already exists; nothing to do.", file=sys.stderr)
            return 1

        workspace_id = seed_demo_workspace(session, owner_email=args.email)
        session.commit()

    print(f"Seeded demo workspace {workspace_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
