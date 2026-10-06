export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      card_defs: {
        Row: {
          class: string;
          club_id: string;
          id: string;
          player_id: string;
          position: string;
          rating: number;
          variant: string;
        };
        Insert: {
          class: string;
          club_id: string;
          id: string;
          player_id: string;
          position: string;
          rating: number;
          variant: string;
        };
        Update: {
          class?: string;
          club_id?: string;
          id?: string;
          player_id?: string;
          position?: string;
          rating?: number;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_defs_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      card_items: {
        Row: {
          card_id: string;
          created_at: string;
          id: string;
          opening_id: string | null;
          source: string;
          user_id: string;
        };
        Insert: {
          card_id: string;
          created_at?: string;
          id?: string;
          opening_id?: string | null;
          source: string;
          user_id: string;
        };
        Update: {
          card_id?: string;
          created_at?: string;
          id?: string;
          opening_id?: string | null;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_items_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'card_defs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'card_items_opening_id_fkey';
            columns: ['opening_id'];
            isOneToOne: false;
            referencedRelation: 'pack_openings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'card_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'card_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_balances';
            referencedColumns: ['user_id'];
          },
        ];
      };
      club_seasons: {
        Row: {
          club_id: string;
          division_id: string;
          season: string;
        };
        Insert: {
          club_id: string;
          division_id: string;
          season: string;
        };
        Update: {
          club_id?: string;
          division_id?: string;
          season?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'club_seasons_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'club_seasons_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
        ];
      };
      clubs: {
        Row: {
          city: string;
          colours_source: string;
          district_id: string;
          division_id: string;
          division_known: boolean;
          founded: number | null;
          id: string;
          insee: string;
          name: string;
          pattern: string;
          primary_colour: string;
          secondary_colour: string;
          short_name: string;
          stadium_name: string;
          surface: string;
          tertiary_colour: string | null;
          verified: boolean;
        };
        Insert: {
          city: string;
          colours_source: string;
          district_id: string;
          division_id: string;
          division_known?: boolean;
          founded?: number | null;
          id: string;
          insee: string;
          name: string;
          pattern: string;
          primary_colour: string;
          secondary_colour: string;
          short_name: string;
          stadium_name: string;
          surface: string;
          tertiary_colour?: string | null;
          verified?: boolean;
        };
        Update: {
          city?: string;
          colours_source?: string;
          district_id?: string;
          division_id?: string;
          division_known?: boolean;
          founded?: number | null;
          id?: string;
          insee?: string;
          name?: string;
          pattern?: string;
          primary_colour?: string;
          secondary_colour?: string;
          short_name?: string;
          stadium_name?: string;
          surface?: string;
          tertiary_colour?: string | null;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'clubs_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clubs_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_ledger: {
        Row: {
          created_at: string;
          delta: number;
          id: number;
          reason: string;
          ref: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          delta: number;
          id?: never;
          reason: string;
          ref?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          id?: never;
          reason?: string;
          ref?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_balances';
            referencedColumns: ['user_id'];
          },
        ];
      };
      districts: {
        Row: {
          departments: string[];
          id: string;
          league_id: string;
          name: string;
        };
        Insert: {
          departments: string[];
          id: string;
          league_id: string;
          name: string;
        };
        Update: {
          departments?: string[];
          id?: string;
          league_id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'districts_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
        ];
      };
      divisions: {
        Row: {
          district_id: string | null;
          id: string;
          league_id: string | null;
          level: string;
          name: string;
          pool: string | null;
          rank: number;
          scope: string;
        };
        Insert: {
          district_id?: string | null;
          id: string;
          league_id?: string | null;
          level: string;
          name: string;
          pool?: string | null;
          rank: number;
          scope: string;
        };
        Update: {
          district_id?: string | null;
          id?: string;
          league_id?: string | null;
          level?: string;
          name?: string;
          pool?: string | null;
          rank?: number;
          scope?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'divisions_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'divisions_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
        ];
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          region: string;
        };
        Insert: {
          id: string;
          name: string;
          region: string;
        };
        Update: {
          id?: string;
          name?: string;
          region?: string;
        };
        Relationships: [];
      };
      pack_openings: {
        Row: {
          cards: string[];
          created_at: string;
          id: string;
          pack_id: string;
          request_id: string;
          seed: string;
          type: string;
          user_id: string;
        };
        Insert: {
          cards: string[];
          created_at?: string;
          id?: string;
          pack_id: string;
          request_id: string;
          seed: string;
          type: string;
          user_id: string;
        };
        Update: {
          cards?: string[];
          created_at?: string;
          id?: string;
          pack_id?: string;
          request_id?: string;
          seed?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pack_openings_pack_id_fkey';
            columns: ['pack_id'];
            isOneToOne: true;
            referencedRelation: 'user_packs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pack_openings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pack_openings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_balances';
            referencedColumns: ['user_id'];
          },
        ];
      };
      profiles: {
        Row: {
          club_id: string | null;
          created_at: string;
          id: string;
          pseudo: string;
        };
        Insert: {
          club_id?: string | null;
          created_at?: string;
          id: string;
          pseudo: string;
        };
        Update: {
          club_id?: string | null;
          created_at?: string;
          id?: string;
          pseudo?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      user_packs: {
        Row: {
          created_at: string;
          id: string;
          opened_at: string | null;
          request_id: string | null;
          source: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          request_id?: string | null;
          source: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          request_id?: string | null;
          source?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_packs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_packs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_balances';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: {
      wallet_balances: {
        Row: {
          balance: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      choose_club: { Args: { p_club: string; p_user: string }; Returns: undefined };
      claim_welcome: { Args: { p_amount: number; p_user: string }; Returns: number };
      grant_pack: {
        Args: {
          p_price: number;
          p_request?: string;
          p_source: string;
          p_type: string;
          p_user: string;
        };
        Returns: string;
      };
      open_pack: {
        Args: {
          p_cards: string[];
          p_pack: string;
          p_request: string;
          p_seed: string;
          p_user: string;
        };
        Returns: string[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
