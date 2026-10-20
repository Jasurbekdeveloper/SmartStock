# SmartStock

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Multi-store setup and legacy data migration

Public registration is disabled. `/auth/register` redirects to login; store owners and employees
must be provisioned by an administrator. Each provisioned store has a `tenantId` in Firestore,
and product images are stored under that store's Storage path. Billing and multiple stores per
owner are not enabled yet.

Before deploying the tenant-aware client and rules to a Firebase project that already has SmartStock
data, back up Firestore and migrate the existing store first. Use an active admin UID from that project.
The migration script uses the Firebase Admin SDK with Application Default Credentials; do not commit
service-account keys or put credentials in source control:

```powershell
cd scripts\tenant-migration
npm install
$env:FIREBASE_PROJECT_ID = "your-firebase-project-id"
$env:LEGACY_OWNER_UID = "existing-admin-auth-uid"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\service-account.json"
npm run migrate
```

Optionally set `LEGACY_TENANT_ID` to choose the tenant document ID; otherwise it uses
`legacy-<project-id>`. The migration adds `tenantId` to legacy business documents, copies the public
store settings and restricted integration settings to tenant-specific documents, and is safe to rerun.
Review its summary before deploying. Only then deploy the new Firestore and Storage rules with the
client; until migration completes, old profiles cannot access tenant-scoped data.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
