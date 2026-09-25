# logicle-custom-pi-openrouter-helm

Helm chart for deploying **logicle-custom-pi-openrouter** on Kubernetes.

The chart is published separately from the Docker image so the two OCI artifacts remain easy to distinguish:

- Docker image: `ghcr.io/lucapgt/logicle-custom-pi-openrouter`
- Helm chart: `oci://ghcr.io/lucapgt/logicle-custom-pi-openrouter-helm`

The chart deploys the custom fork image by default.

## Prerequisites

- Kubernetes 1.21+
- Helm 3.8+
- A PostgreSQL database
- An ingress controller (for example nginx)

## Installation

```bash
helm install logicle-custom \
  oci://ghcr.io/lucapgt/logicle-custom-pi-openrouter-helm \
  --set config.fqdn=chat.example.com \
  --set database.host=postgres.example.com \
  --set database.password=<db-password> \
  --set config.NEXTAUTH_SECRET=<random-secret>
```

For a specific released chart version, add `--version <version>`.
