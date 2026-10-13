# Logicle + Pi Native V4 — branch opt-in e aggiornamento conservativo

Questo branch aggiunge **soltanto** il bridge backend e la pagina Logicle V4. Non contiene codice del satellite privato, credenziali, sessioni JSONL, file .env o immagini/container.

## Compatibilità e limiti
- Le API legacy /api/pi e la chat esistente NON vengono modificate.
- Nessuna migrazione SQL e nessuna modifica allo schema PostgreSQL sono introdotte da questo commit.
- La pagina /pi-v4/:sessionId è accessibile solo per sessioni già autorizzate all'utente.
- Il bridge V4 è disabilitato in assenza delle variabili server V4_CONTROL_INTERNAL_URL, V4_CONTROL_UI_TOKEN e V4_CONTROL_SESSION_ID.
- **Il control plane attuale è single-session**: il bridge rifiuta ID non corrispondenti.
- Il completamento end-to-end Pi/Podman/gateway e la disponibilità dello storico chat definitivo NON sono certificati da questo commit. Gli eventi vengono riletti dal control plane, non duplicati nel database Logicle.

## Aggiornamento dell'installazione esistente — non eseguire automaticamente
1. Confermare il branch e identificare commit e immagine attualmente utilizzati.
2. Eseguire **backup verificato** del PostgreSQL e delle configurazioni esistenti, conservando i nomi e il contenuto di tutti i volumi dati.
3. Eseguire build e test del branch contro un database V4 di sviluppo separato.
4. Non eseguire mai `docker compose down -v`, `docker volume rm`, reset del DB o migrazioni distruttive.
5. Applicare l'upgrade sull'impianto esistente soltanto dopo verifica della compatibilità dello schema. Conservare rollback dell'immagine e del database.
6. Se non si abilita il servizio V4, il percorso Pi legacy resta invariato.

## Verifiche richieste prima dell'upgrade
- `pnpm run generate:backend-route-manifest`, `pnpm run check-types`, `pnpm run build`
- Test su login, proprietà delle sessioni, replay dopo F5, idempotenza dei turni, strumenti Pi in diretta
- Confronto schema e test di restore dal backup su PostgreSQL non produttivo
- Nessun test o riavvio dell'ambiente V2 durante lo sviluppo

**Non pubblicare** il satellite Go: è materiale privato e indipendente da questo repository.
