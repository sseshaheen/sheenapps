# Key Rotation Runbook

> Manual procedure for rotating master encryption keys used by Easy Mode SDK services.

---

## Overview

The Easy Mode SDK uses envelope encryption:
- **Master Key (KEK)**: Encrypts data keys. Stored in environment variables.
- **Data Key (DEK)**: Encrypts actual secrets/backups. Stored encrypted in database.

This runbook covers rotation of:
- `SHEEN_SECRETS_MASTER_KEY` - Used by @sheenapps/secrets
- `SHEEN_BACKUP_MASTER_KEY` - Used by @sheenapps/backups

---

## Pre-Rotation Checklist

- [ ] Verify current key works (test decrypt a secret)
- [ ] Generate new 32+ byte key: `openssl rand -base64 32`
- [ ] Have database access ready
- [ ] Schedule maintenance window (brief - re-encryption is fast)
- [ ] Notify team of rotation

---

## Rotation Procedure

### Phase 1: Introduce New Key

1. **Generate new master key**:
   ```bash
   NEW_KEY=$(openssl rand -base64 32)
   echo "New key: $NEW_KEY"
   ```

2. **Add as secondary key** in all environments:
   ```bash
   # Vercel / Worker deployment
   SHEEN_SECRETS_MASTER_KEY_NEXT=$NEW_KEY
   # or
   SHEEN_BACKUP_MASTER_KEY_NEXT=$NEW_KEY
   ```

3. **Update key version table** (for secrets):
   ```sql
   INSERT INTO public.inhouse_secrets_key_versions
     (version, key_id_reference, status)
   VALUES
     (2, 'sheenapps-secrets-master-v2', 'pending');
   ```

4. **Deploy** worker with both keys available

### Phase 2: Re-Encrypt Data

5. **For Secrets** - Re-encrypt all secrets with new key:
   ```sql
   -- Mark new key as active
   UPDATE public.inhouse_secrets_key_versions
   SET status = 'active', activated_at = NOW()
   WHERE version = 2;

   -- Mark old key as deprecated
   UPDATE public.inhouse_secrets_key_versions
   SET status = 'deprecated', deprecated_at = NOW()
   WHERE version = 1;
   ```

   Then run re-encryption script (pseudocode):
   ```typescript
   // For each secret:
   // 1. Decrypt data_key with OLD master key
   // 2. Re-encrypt data_key with NEW master key
   // 3. Update encrypted_data_key, data_key_iv, key_version

   for (const secret of allSecrets) {
     const dataKey = decryptWithOldMaster(secret.encrypted_data_key);
     const { encryptedDataKey, iv } = encryptWithNewMaster(dataKey);
     await db.query(`
       UPDATE inhouse_secrets
       SET encrypted_data_key = $1, data_key_iv = $2, key_version = 2
       WHERE id = $3
     `, [encryptedDataKey, iv, secret.id]);
   }
   ```

6. **For Backups** - Re-encrypt backup manifests:
   ```typescript
   // Similar pattern - decrypt manifest with old key, re-encrypt with new
   ```

### Phase 3: Promote New Key

7. **Swap environment variables**:
   ```bash
   # Old key becomes fallback
   SHEEN_SECRETS_MASTER_KEY_OLD=$OLD_KEY

   # New key becomes primary
   SHEEN_SECRETS_MASTER_KEY=$NEW_KEY

   # Remove _NEXT variant
   # (unset SHEEN_SECRETS_MASTER_KEY_NEXT)
   ```

8. **Deploy** with new primary key

### Phase 4: Grace Period

9. **Keep old key for N days** (recommended: 7-14 days):
   - Allows decryption of any data missed during re-encryption
   - Allows rollback if issues discovered
   - Service should try new key first, fall back to old

10. **Monitor** for decryption errors in logs

### Phase 5: Remove Old Key

11. **After grace period**, remove old key:
    ```bash
    # Unset old key
    # (unset SHEEN_SECRETS_MASTER_KEY_OLD)
    ```

12. **Mark old key version as retired**:
    ```sql
    UPDATE public.inhouse_secrets_key_versions
    SET status = 'retired'
    WHERE version = 1;
    ```

13. **Final deployment** with only new key

---

## Rollback Procedure

If issues occur after rotation:

1. **Re-add old key** as primary:
   ```bash
   SHEEN_SECRETS_MASTER_KEY=$OLD_KEY
   ```

2. **Deploy immediately**

3. **Investigate** issues before re-attempting rotation

4. **If data was re-encrypted**, may need to run reverse re-encryption

---

## Key Version States

| Status | Meaning |
|--------|---------|
| `pending` | Key created but not yet active |
| `active` | Currently used for new encryptions |
| `deprecated` | No longer used for new encryptions, still valid for decryption |
| `retired` | Completely removed, cannot decrypt |

---

## Security Notes

- **Never log keys** - Even partial keys can be brute-forced
- **Rotate on compromise** - If key exposure suspected, rotate immediately
- **Backup before rotation** - Database backup before re-encryption
- **Test in staging first** - Always test full rotation in non-production
- **Key generation** - Use cryptographically secure random: `openssl rand -base64 32`

---

## Future: External KMS Integration

When migrating to AWS KMS or HashiCorp Vault:

1. Create new KMS key
2. Update `key_id_reference` in `inhouse_secrets_key_versions` to KMS key ARN
3. Modify `InhouseSecretsService.getMasterKey()` to fetch from KMS
4. Re-encryption handled by KMS automatic key rotation

This eliminates manual rotation for secrets - KMS handles it automatically.

---

## Contacts

- **On-call**: Check PagerDuty rotation
- **Security team**: For key compromise incidents
- **Database admin**: For bulk re-encryption assistance
