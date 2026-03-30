docker buildx build -f Dockerfile -t ghcr.io/irazvan2745/dokploy:$1 .
docker push ghcr.io/irazvan2745/dokploy:$1