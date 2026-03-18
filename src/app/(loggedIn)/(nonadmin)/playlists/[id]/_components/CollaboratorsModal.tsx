'use client';

import { useState } from 'react';
import { Button, Divider, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { addCollaborator, removeCollaborator } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';

type Collaborator = {
  id: string;
  name: string | null;
  email: string | null;
};

type CollaboratorsModalProps = {
  opened: boolean;
  onClose: () => void;
  playlistId: string;
  ownerLabel: string;
  collaborators: Collaborator[];
  canManage: boolean;
};

export default function CollaboratorsModal({
  opened,
  onClose,
  playlistId,
  ownerLabel,
  collaborators,
  canManage,
}: CollaboratorsModalProps) {
  const router = useRouter();
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!canManage) return;
    const email = collaboratorEmail.trim();
    if (!email) return;

    setSavingCollaborator(true);
    try {
      const result = await addCollaborator(playlistId, email);
      handleAction(result);
      notifications.show({
        title: 'Collaborateur ajouté',
        message: 'Cet utilisateur peut maintenant gérer la playlist.',
        color: 'green',
      });
      setCollaboratorEmail('');
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({ title: 'Erreur', message, color: 'red' });
    } finally {
      setSavingCollaborator(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!canManage) return;
    setRemovingCollaboratorId(userId);
    try {
      const result = await removeCollaborator(playlistId, userId);
      handleAction(result);
      notifications.show({
        title: 'Collaborateur retiré',
        message: 'Cet utilisateur ne peut plus gérer la playlist.',
        color: 'green',
      });
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({ title: 'Erreur', message, color: 'red' });
    } finally {
      setRemovingCollaboratorId(null);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Collaborateurs" size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {ownerLabel}
        </Text>

        {collaborators.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucun collaborateur pour le moment.
          </Text>
        ) : (
          <Stack gap={6}>
            {collaborators.map((user) => (
              <Group key={user.id} justify="space-between" align="center">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {user.name ?? user.email ?? 'Utilisateur'}
                  </Text>
                  {user.email && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {user.email}
                    </Text>
                  )}
                </div>
                {canManage && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    loading={removingCollaboratorId === user.id}
                    onClick={() => handleRemove(user.id)}
                  >
                    Retirer
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
        )}

        {canManage && (
          <>
            <Divider my="sm" />
            <Group align="flex-end" gap="sm">
              <TextInput
                label="Ajouter un collaborateur"
                placeholder="Email de l'utilisateur"
                value={collaboratorEmail}
                onChange={(event) => setCollaboratorEmail(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleAdd}
                loading={savingCollaborator}
                disabled={!collaboratorEmail.trim()}
              >
                Ajouter
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

