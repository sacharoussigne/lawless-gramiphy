'use client';

import { ActionIcon, Group, Text } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { routes } from '@/types/routes';

type TopBarProps = {
  opened: boolean;
  toggle: () => void;
};

export default function TopBar({ opened, toggle }: TopBarProps) {
  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={toggle}
          aria-label={opened ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <IconMenu2 size={20} stroke={1.8} />
        </ActionIcon>

        <Link href={routes.library.index} style={{ textDecoration: 'none' }}>
          <Group gap={8} wrap="nowrap">
          <Image
            src="/logo_gramiphy.png"
            alt="Gramiphy"
            width={28}
            height={28}
            style={{ borderRadius: 6 }}
          />
          <Text fw={700} size="sm">
            Gramiphy
          </Text>
          </Group>
        </Link>
      </Group>
    </Group>
  );
}

