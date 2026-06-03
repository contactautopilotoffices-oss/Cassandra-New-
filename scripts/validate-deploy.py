#!/usr/bin/env python3
"""
Pre-deployment validator for Render.
Run this before pushing to catch config issues.
"""

import os
import sys

REQUIRED_ENV = [
    ("FMS_SUPABASE_URL", "FMS Supabase project URL"),
    ("FMS_SUPABASE_SERVICE_ROLE_KEY", "FMS Supabase service role key"),
    ("OPENAI_API_KEY", "OpenAI API key"),
    ("SUPABASE_JWT_SECRET", "Supabase JWT secret for token validation"),
]

OPTIONAL_ENV = [
    ("OPENAI_MODEL", "gpt-4o-mini"),
    ("OPENAI_TEMPERATURE", "0.7"),
    ("OPENAI_MAX_TOKENS", "2048"),
]


def check_file(path, description):
    exists = os.path.exists(path)
    status = "✓" if exists else "✗ MISSING"
    print(f"  {status} {description}: {path}")
    return exists


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    print("=== Render Deployment Validator ===\n")

    # Files
    files_ok = True
    print("Files:")
    files_ok &= check_file("Procfile", "Procfile")
    files_ok &= check_file("runtime.txt", "Python runtime")
    files_ok &= check_file("requirements.txt", "Root requirements")
    files_ok &= check_file("render.yaml", "Render blueprint")
    files_ok &= check_file("cassandra/requirements.txt", "Cassandra requirements")
    files_ok &= check_file("cassandra/orchestrator/api_server.py", "API server entry")
    files_ok &= check_file("saas_mobile_app/types/database.types.ts", "TypeScript schema")

    # Schema sync
    print("\nSchema sync:")
    try:
        sys.path.insert(0, root)
        from cassandra.tools.schema_sync import sync_schema, get_table_count

        updated = sync_schema()
        count = get_table_count()
        print(f"  ✓ Schema synced: {count} tables")
        if updated:
            print(f"  ⚠ fms_schema.py was updated — remember to commit it")
    except Exception as exc:
        print(f"  ✗ Schema sync failed: {exc}")
        files_ok = False

    # Env vars (local check)
    print("\nEnvironment variables (local .env check):")
    env_ok = True
    for key, desc in REQUIRED_ENV:
        val = os.environ.get(key)
        if val:
            masked = val[:8] + "..." + val[-4:] if len(val) > 16 else "***"
            print(f"  ✓ {key}: {masked}")
        else:
            print(f"  ✗ {key}: NOT SET ({desc})")
            env_ok = False

    for key, default in OPTIONAL_ENV:
        val = os.environ.get(key)
        if val:
            print(f"  ✓ {key}: {val}")
        else:
            print(f"  ○ {key}: using default '{default}'")

    # Start command simulation
    print("\nStart command test:")
    procfile = open("Procfile").read().strip()
    cmd = procfile.replace("web: ", "")
    print(f"  Procfile command: {cmd}")
    if "uvicorn" in cmd and "orchestrator.api_server" in cmd:
        print("  ✓ Start command looks correct")
    else:
        print("  ✗ Start command may be incorrect")
        files_ok = False

    # Summary
    print("\n" + "=" * 40)
    if files_ok and env_ok:
        print("✓ All checks passed — ready to deploy!")
        print("\nNext steps:")
        print("  1. git add Procfile runtime.txt requirements.txt render.yaml DEPLOY.md")
        print("  2. git commit -m 'chore: add Render deployment config'")
        print("  3. git push")
        print("  4. In Render dashboard → Blueprints → deploy from render.yaml")
        return 0
    else:
        print("✗ Some checks failed — fix above issues before deploying.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
