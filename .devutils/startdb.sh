docker run --rm --name pg -e POSTGRES_PASSWORD=password -e POSTGRES_USER=rise -e POSTGRES_DB=rise_db -p 5432:5432 postgres:10-alpine postgres -c 'shared_buffers=4096MB' -c 'max_connections=200' -c 'synchronous_commit=off' -c 'min_wal_size=1GB' -c 'max_wal_size=2GB' -c 'checkpoint_completion_target=0.9' -c 'wal_buffers=16MB'

