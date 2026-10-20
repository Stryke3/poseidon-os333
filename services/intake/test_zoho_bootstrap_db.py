"""Exercise the vault against an explicitly configured disposable test database."""
import os
from pathlib import Path
import sys
import unittest
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'shared'))
from zoho_bootstrap import PgVault, SetupError

@unittest.skipUnless(os.getenv('BOOTSTRAP_TEST_DSN'), 'Disposable database not configured')
class VaultDatabaseTests(unittest.TestCase):
    def test_committed_receipt_and_session_lock_survive_reconnect(self):
        dsn = os.environ['BOOTSTRAP_TEST_DSN']
        slot = 'synthetic-' + uuid.uuid4().hex
        with PgVault(dsn, slot) as vault:
            self.assertEqual(vault.read()['state'], 'empty')
            vault.reserve('synthetic-grant-hash')
            vault.save('synthetic-ciphertext')
            with self.assertRaisesRegex(SetupError, 'setup_in_progress'):
                with PgVault(dsn, slot):
                    pass
            vault.state('verified')
        with PgVault(dsn, slot) as vault:
            self.assertEqual(vault.read(), {
                'grant_digest': 'synthetic-grant-hash',
                'encrypted_token': 'synthetic-ciphertext',
                'state': 'verified',
            })
            vault.conn.execute('DELETE FROM public.sfm_zoho_oauth_vault WHERE credential_key=%s', (slot,))

if __name__ == '__main__':
    unittest.main()
