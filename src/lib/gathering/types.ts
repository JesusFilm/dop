export type GatheringPhase = "FORMING" | "ASSIGNED";

export type ParticipantMember = {
  id: string;
  name: string;
  isCoordinator: boolean;
};

export type ParticipantSnapshot =
  | { state: "JOIN"; revision: number }
  | {
      state: "LOBBY";
      revision: number;
      participant: { id: string; name: string };
      participantCount: number;
    }
  | {
      state: "ROOM";
      revision: number;
      participant: { id: string; name: string };
      room: {
        id: string;
        name: string;
        directions: string;
        members: ParticipantMember[];
      };
    };

export type OrganizerRoomSnapshot = {
  id: string;
  name: string;
  directions: string;
  maxCapacity: number | null;
  memberCount: number;
  coordinatorName: string | null;
  members: ParticipantMember[];
};

export type OrganizerSnapshot = {
  phase: GatheringPhase;
  revision: number;
  participantCount: number;
  capacitySufficient: boolean;
  rooms: OrganizerRoomSnapshot[];
};
