# Backup diario de Chanchito (VPS)

`chanchito-backup.sh` dumpea la base de producción de Supabase todos los días
desde el VPS RackNerd y retiene los últimos **14** dumps verificados. Diseño
completo en el encabezado del script; decisión de origen: sesión 2026-08-26
(la org de Supabase está en Free, sin backups propios, con usuarios reales).

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Script (fuente de verdad) | `infra/vps/chanchito-backup.sh` en este repo |
| Script (ejecutable) | `/opt/chanchito-backup/chanchito-backup.sh` en el VPS |
| Credenciales | `/opt/chanchito-backup/.env` (chmod 600, fuera de todo repo) |
| Dumps | `/root/backups/chanchito/chanchito-YYYYMMDD-HHMMSS.dump` |
| Cron | crontab de root, `0 7 * * *` (04:00 AR) — documentado en el `crontab.txt` del vault Panchito |
| Log | `/var/log/chanchito-backup.log` |
| Monitoreo | el vigía de Panchito monta `/root/backups/chanchito` como `:ro` y reclama en el briefing si el dump más nuevo pasa las 26 h |

## `.env` esperado

```bash
PGHOST=aws-1-sa-east-1.pooler.supabase.com   # pooler IPv4 — db.<ref> es IPv6-only
PGPORT=5432                                   # session mode; el 6543 (transaction) no sirve para pg_dump
PGUSER=postgres.mkkgdjxaotgimqwhyesx
PGDATABASE=postgres
PGPASSWORD=<SUPABASE_DB_PASSWORD del .env.local del repo>
```

⚠️ Rotar `SUPABASE_DB_PASSWORD` toca **tres** consumidores: el `.env.local` del
repo, la credencial Postgres de n8n y este `.env` (lección del episodio de los
290 avisos, ago-2026).

## Deploy de un cambio del script

```bash
scp infra/vps/chanchito-backup.sh panchito-vps:/opt/chanchito-backup/chanchito-backup.sh
ssh panchito-vps "chmod 700 /opt/chanchito-backup/chanchito-backup.sh && /opt/chanchito-backup/chanchito-backup.sh"
```

(La segunda línea corre un backup a mano como smoke test: es barato y no toca
nada — el dump es sólo lectura contra la base.)

## Restaurar

**Nunca contra producción salvo desastre real.** El destino natural es la base
DEV (cuando exista) — restaurar ahí es, además, el test periódico de que los
backups sirven.

```bash
docker run --rm -e PGPASSWORD=<password-destino> \
  -v /root/backups/chanchito:/in postgres:17-alpine \
  pg_restore -h <pooler-destino> -p 5432 -U postgres.<ref-destino> -d postgres \
    --clean --if-exists --no-owner --no-privileges \
    /in/chanchito-YYYYMMDD-HHMMSS.dump
```

Notas: el dump trae `public` + `auth` + `supabase_migrations`. En un proyecto
Supabase destino, `auth` ya existe con sus tablas (mismo layout); `--clean
--if-exists` pisa lo que haya. Los usuarios restaurados conservan sus UUID, así
que las FK de `public` siguen válidas.

## Qué NO cubre

- **Storage**: Chanchito no usa buckets — no hay nada que copiar.
- **Config de Auth** (providers, redirect URLs): vive en el dashboard, no en la
  base. Si se pierde el proyecto, se reconfigura a mano (está documentada en la
  Doc Técnica del vault).
- **Copia offsite**: decisión 2026-08-26 — solo VPS por ahora; si algún día se
  quiere, es una línea de rclone sobre `/root/backups/chanchito`.
